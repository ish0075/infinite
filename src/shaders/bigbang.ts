export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uScrollProgress;
  uniform vec2 uResolution;
  uniform float uExplosion;
  uniform float uOpacity;

  varying vec2 vUv;

  // Simplex 3D Noise
  vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 5; i++) {
      value += amplitude * snoise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    uv.x *= uResolution.x / uResolution.y;

    float dist = length(uv);
    float angle = atan(uv.y, uv.x);

    // Explosion intensity: 0 -> 0 at scroll 0.4, peaks at 0.5, fades by 0.7
    float explode = smoothstep(0.35, 0.45, uScrollProgress) 
                  * (1.0 - smoothstep(0.55, 0.75, uScrollProgress));
    explode = pow(explode, 0.7);

    // Core expansion radius based on scroll
    float expansion = uExplosion * explode * 2.5 + 0.05;

    // Noise field for particle distribution
    float t = uTime * 0.3;
    vec3 noisePos = vec3(
      uv.x * 2.0 + expansion * 0.5,
      uv.y * 2.0 + expansion * 0.3,
      t
    );
    float noise = fbm(noisePos);

    // Radial explosion wave
    float wave = sin(dist * 15.0 - expansion * 8.0 + t * 3.0) * 0.5 + 0.5;
    wave *= exp(-dist * 2.0);

    // Particle density function: clusters near ring at expansion radius
    float ring = exp(-pow((dist - expansion * 0.8) * 4.0, 2.0));
    float coreGlow = exp(-dist * 8.0 / (expansion + 0.1));

    // Combine
    float particles = noise * ring + coreGlow * 2.0 + wave * 0.3 * explode;
    particles *= smoothstep(1.5, 0.0, dist);

    // Color: white-hot core → gold → orange → red → deep purple
    vec3 coreColor = vec3(1.0, 0.98, 0.95);
    vec3 midColor = vec3(1.0, 0.7, 0.2);
    vec3 outerColor = vec3(0.9, 0.2, 0.1);
    vec3 edgeColor = vec3(0.3, 0.05, 0.4);

    float colorMix = dist / (expansion + 0.3);
    vec3 color = mix(coreColor, midColor, smoothstep(0.0, 0.3, colorMix));
    color = mix(color, outerColor, smoothstep(0.2, 0.6, colorMix));
    color = mix(color, edgeColor, smoothstep(0.5, 1.0, colorMix));

    // Brightness falloff with distance from expansion center
    float brightness = particles * (1.0 + explode * 3.0);
    brightness *= smoothstep(1.2, 0.0, dist);

    // Chromatic aberration at high explosion
    float chroma = explode * 0.03;
    vec3 finalColor = color * brightness;
    finalColor.r += snoise(vec3(uv * 3.0 + vec2(chroma, 0.0), t)) * chroma;
    finalColor.b += snoise(vec3(uv * 3.0 - vec2(chroma, 0.0), t)) * chroma;

    // Film grain
    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    finalColor += (grain - 0.5) * 0.02;

    // Vignette
    float vignette = 1.0 - smoothstep(0.5, 1.5, dist);
    finalColor *= vignette;

    // Alpha based on brightness so black doesn't cover layers beneath
    float alpha = max(max(finalColor.r, finalColor.g), finalColor.b) * uOpacity;
    gl_FragColor = vec4(finalColor * uOpacity, alpha);
  }
`;

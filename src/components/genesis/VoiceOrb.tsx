import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AudioData } from '../../types/audio';

// ─── Voice Orb Shader: The Sun at the Center of the Universe ───
const VoiceOrbShader = {
  uniforms: {
    uTime: { value: 0 },
    uAudioLow: { value: 0.0 },
    uAudioMid: { value: 0.0 },
    uAudioHigh: { value: 0.0 },
    uThinking: { value: 0.0 },
    uColorCore: { value: new THREE.Color('#FFD700') }, // Gold
    uColorRim: { value: new THREE.Color('#00FFFF') },  // Electric Blue
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    uniform float uAudioLow;
    uniform float uAudioMid;
    uniform float uAudioHigh;
    uniform float uThinking;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying float vDisplacement;

    // Simplex 3D Noise for organic surface displacement
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
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
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    void main() {
      vNormal = normalize(normalMatrix * normal);

      // Organic pulse + audio reactivity
      float noise = snoise(position * 1.5 + uTime * 0.4);
      float pulse = sin(uTime * 1.5 + noise * 2.0) * 0.03;

      // Audio drives displacement amplitude
      // Bass = large organic swell, Mid = surface ripples, High = fine shimmer
      float audioPulse = uAudioLow * 0.18 + uAudioMid * 0.08 + uAudioHigh * 0.04;

      // Thinking state adds a faster, deeper pulse
      float thinkPulse = uThinking * sin(uTime * 4.0) * 0.06;

      vDisplacement = pulse + audioPulse + thinkPulse;
      vec3 newPosition = position + normal * (pulse + audioPulse + thinkPulse);

      vec4 worldPosition = modelMatrix * vec4(newPosition, 1.0);
      vWorldPosition = worldPosition.xyz;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColorCore;
    uniform vec3 uColorRim;
    uniform float uAudioLow;
    uniform float uAudioMid;
    uniform float uAudioHigh;
    uniform float uThinking;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying float vDisplacement;

    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);

      // Core is gold, rim is electric blue
      vec3 color = mix(uColorCore, uColorRim, fresnel * 1.2);

      // Audio reactivity brightens the core
      // Bass = warm glow from center, Mid = blue rim surge, High = white-hot sparks
      color += uColorCore * uAudioLow * 0.6;
      color += uColorRim * uAudioMid * 0.4;
      color += vec3(1.0, 1.0, 1.0) * uAudioHigh * 0.3;

      // Thinking state: bright cyan surge across the rim
      color += vec3(0.0, 1.0, 1.0) * uThinking * fresnel * 0.8;
      color += uColorCore * uThinking * 0.3;

      // Shimmer on the surface — faster when audio or thinking is active
      float shimmerSpeed = 3.0 + uAudioLow * 5.0 + uThinking * 8.0;
      float shimmer = sin(uTime * shimmerSpeed + vWorldPosition.x * 5.0) * 0.5 + 0.5;
      color += uColorRim * shimmer * fresnel * 0.3;

      // Alpha: strong fresnel glow + soft core presence
      float alpha = fresnel * 0.85 + 0.15 + uAudioLow * 0.25 + uThinking * 0.2;
      alpha = clamp(alpha, 0.0, 1.0);

      gl_FragColor = vec4(color, alpha);
    }
  `,
};

// ─── Interface ───
interface VoiceOrbProps {
  audioDataRef: React.RefObject<AudioData | null>;
  scrollProgress: React.MutableRefObject<{ progress: number; velocity: number }>;
}

// ─── Component: VoiceOrb ───
export function VoiceOrb({ audioDataRef, scrollProgress }: VoiceOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const baseScaleRef = useRef(0); // For emergence animation

  useFrame(({ clock }) => {
    if (!materialRef.current || !meshRef.current) return;

    const elapsed = clock.getElapsedTime();
    const p = scrollProgress.current.progress;

    // ─── Emergence: Scale in as user scrolls into Act III ───
    // Act III starts around 0.58; full presence by 0.75
    const emergence = smoothstep(0.58, 0.75, p);
    // Smooth the scale transition
    baseScaleRef.current += (emergence - baseScaleRef.current) * 0.05;

    // ─── Audio Reactivity ───
    const audio = audioDataRef.current;
    const bass = audio?.bass ?? 0;
    const mid = audio?.mid ?? 0;
    const high = audio?.treble ?? 0;
    const thinking = audio?.thinking ?? 0;

    // Scale: base + bass swell + thinking pulse
    const scaleMultiplier = 1.0 + bass * 0.35 + mid * 0.15 + thinking * 0.2;
    const finalScale = baseScaleRef.current * scaleMultiplier;
    meshRef.current.scale.setScalar(Math.max(0.001, finalScale));

    // ─── Shader Uniforms ───
    materialRef.current.uniforms.uTime.value = elapsed;
    materialRef.current.uniforms.uAudioLow.value = bass;
    materialRef.current.uniforms.uAudioMid.value = mid;
    materialRef.current.uniforms.uAudioHigh.value = high;
    materialRef.current.uniforms.uThinking.value = thinking;

    // ─── Eternal rotation ───
    meshRef.current.rotation.y += 0.002 + bass * 0.008;
    meshRef.current.rotation.x += 0.001 + mid * 0.004;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.2, 32]} />
      <shaderMaterial
        ref={materialRef}
        args={[VoiceOrbShader]}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

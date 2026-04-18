import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── GLSL Shader: The Mathematical DNA of the Explosion ───
const BigBangShader = {
  uniforms: {
    uTime: { value: 0 },
    uProgress: { value: 0 }, // 0 → 1 across the entire scroll journey
    uResolution: { value: new THREE.Vector2() },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uProgress;
    uniform vec2 uResolution;
    varying vec2 vUv;

    // ─── Simplex 2D Noise ───
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
               -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
        + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xy + h.yz * x12.zw;
      return dot(g, x);
    }

    // ─── Fractional Brownian Motion for turbulent energy ───
    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      for (int i = 0; i < 4; i++) {
        value += amplitude * snoise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
      }
      return value;
    }

    void main() {
      vec2 uv = vUv - 0.5;
      uv.x *= uResolution.x / uResolution.y;

      float dist = length(uv);

      // Map global scroll progress to the Act II window (0.33 → 0.66)
      float actProgress = clamp((uProgress - 0.33) / 0.33, 0.0, 1.0);

      // ─── Explosion Dynamics ───
      float expansionRadius = actProgress * 2.2;
      float t = uTime * 0.8;

      // Turbulent noise field
      float noise = fbm(uv * 4.0 + t * 0.3 + expansionRadius);
      float fineNoise = snoise(uv * 12.0 - t * 0.5) * 0.3;

      // ─── Shockwave Ring ───
      float ringWidth = 0.08 + actProgress * 0.15;
      float ring = smoothstep(expansionRadius + ringWidth, expansionRadius, dist) *
                   smoothstep(expansionRadius - ringWidth * 2.0, expansionRadius, dist);

      // Secondary echo rings
      float echo1 = smoothstep(expansionRadius * 0.6 + 0.05, expansionRadius * 0.6, dist) *
                    smoothstep(expansionRadius * 0.6 - 0.1, expansionRadius * 0.6, dist);
      float echo2 = smoothstep(expansionRadius * 0.35 + 0.03, expansionRadius * 0.35, dist) *
                    smoothstep(expansionRadius * 0.35 - 0.06, expansionRadius * 0.35, dist);

      // ─── Core Glow (The Singularity at the center) ───
      float coreGlow = exp(-dist * 6.0) * (1.0 + actProgress * 3.0);

      // ─── Color Palette: Gold & Electric Blue ───
      vec3 gold = vec3(1.0, 0.84, 0.0);
      vec3 goldHot = vec3(1.0, 0.95, 0.6);
      vec3 blue = vec3(0.0, 0.9, 1.0);
      vec3 blueDeep = vec3(0.0, 0.3, 0.6);
      vec3 white = vec3(1.0, 1.0, 1.0);

      // Mix colors based on noise and distance from explosion front
      vec3 color = mix(gold, blue, noise * 0.5 + 0.5);
      color = mix(color, goldHot, ring * 0.7);
      color = mix(color, white, coreGlow * 0.6);
      color = mix(color, blueDeep, smoothstep(0.0, 1.5, dist));

      // ─── Intensity Envelope ───
      // Peak intensity is when actProgress is around 0.45-0.55
      float envelope = 1.0 - abs(actProgress - 0.5) * 2.5;
      envelope = clamp(envelope, 0.0, 1.0);
      envelope = pow(envelope, 0.6);

      float intensity = (ring * 2.0 + echo1 * 0.5 + echo2 * 0.25 + coreGlow) * envelope;
      intensity += fineNoise * 0.15 * envelope;
      intensity = clamp(intensity, 0.0, 1.0);

      // Fade in / out for Act II boundaries
      // Wider fade-out to create cross-fade overlap with Singularity (0.58+)
      float actFade = smoothstep(0.0, 0.12, actProgress) * (1.0 - smoothstep(0.60, 0.82, actProgress));
      intensity *= actFade;

      // Vignette
      float vignette = 1.0 - smoothstep(0.6, 1.4, dist);
      intensity *= vignette;

      gl_FragColor = vec4(color * intensity, intensity * 0.95);
    }
  `,
};

// ─── Interface ───
interface BigBangLayerProps {
  scrollProgress: React.MutableRefObject<{ progress: number; velocity: number }>;
}

export const BigBangLayer: React.FC<BigBangLayerProps> = ({ scrollProgress }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uProgress.value = scrollProgress.current.progress;
      materialRef.current.uniforms.uResolution.value.set(
        state.size.width,
        state.size.height
      );
    }
  });

  return (
    <mesh ref={meshRef} renderOrder={2}>
      {/* Full-screen plane sitting in front of Void, behind Singularity */}
      <planeGeometry args={[20, 20]} />
      <shaderMaterial
        ref={materialRef}
        args={[BigBangShader]}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
};

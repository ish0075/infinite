import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface VoidLayerProps {
  scrollProgress: React.MutableRefObject<{ progress: number; velocity: number }>;
}

export default function VoidLayer({ scrollProgress }: VoidLayerProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const count = 2000;

  const [positions, sizes, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const sp = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Deep space spherical distribution
      const r = 50 + Math.random() * 150;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      sz[i] = Math.random() * 1.5 + 0.5;
      sp[i] = Math.random() * 0.02 + 0.005;
    }
    return [pos, sz, sp];
  }, []);

  const voidShader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float size;
      attribute float speed;
      varying float vAlpha;
      void main() {
        vec3 pos = position;
        // Subtle drift rotation
        float c = cos(uTime * speed * 0.1);
        float s = sin(uTime * speed * 0.1);
        float newX = pos.x * c - pos.z * s;
        float newZ = pos.x * s + pos.z * c;
        pos.x = newX;
        pos.z = newZ;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * uPixelRatio * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        // Distance fade
        float dist = length(pos);
        vAlpha = smoothstep(200.0, 20.0, dist) * 0.6;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = 1.0 - smoothstep(0.0, 0.5, d);
        glow = pow(glow, 1.8);
        // Deep space blue-white
        vec3 color = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 1.0, 1.0), glow);
        gl_FragColor = vec4(color, vAlpha * glow);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
      // Fade out as we approach the Big Bang (scroll 0.3)
      const p = scrollProgress.current.progress;
      const fade = 1.0 - smoothstep(0.2, 0.4, p);
      materialRef.current.uniforms.uOpacity.value = fade;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={sizes}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-speed"
          count={count}
          array={speeds}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial ref={materialRef} {...voidShader} />
    </points>
  );
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

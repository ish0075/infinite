import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { vertexShader, fragmentShader } from '../shaders/bigbang';

interface BigBangShaderProps {
  scrollProgress: React.MutableRefObject<{ progress: number; velocity: number }>;
}

export default function BigBangShader({ scrollProgress }: BigBangShaderProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  const uniforms = useRef({
    uTime: { value: 0 },
    uScrollProgress: { value: 0 },
    uResolution: { value: new THREE.Vector2(size.width, size.height) },
    uExplosion: { value: 0 },
    uOpacity: { value: 0 },
  });

  useEffect(() => {
    uniforms.current.uResolution.value.set(size.width, size.height);
  }, [size]);

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    const elapsed = clock.getElapsedTime();
    const p = scrollProgress.current.progress;

    // Activation window: 0.30-0.75
    const opacity = smoothstep(0.30, 0.40, p) * (1.0 - smoothstep(0.65, 0.78, p));

    // Scroll 0.35-0.45: build up tension
    // Scroll 0.45-0.55: peak explosion
    // Scroll 0.55-0.70: cooling/decay
    const explosionPhase = smoothstep(0.35, 0.50, p) * (1.0 - smoothstep(0.55, 0.75, p));
    const explosion = Math.pow(explosionPhase, 0.6);

    materialRef.current.uniforms.uTime.value = elapsed;
    materialRef.current.uniforms.uScrollProgress.value = p;
    materialRef.current.uniforms.uExplosion.value = explosion;
    materialRef.current.uniforms.uOpacity.value = opacity;
  });

  return (
    <mesh ref={meshRef} renderOrder={2}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms.current}
        depthWrite={false}
        transparent
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

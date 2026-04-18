import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VoiceOrb } from './VoiceOrb';
import type { AudioData } from '../../types/audio';

// ─── Semantic Graph Data: The Crystallized Knowledge ───
interface GraphNode {
  id: string;
  group: number;
  val: number;
  targetPosition: THREE.Vector3;
  color: THREE.Color;
}

interface GraphLink {
  source: string;
  target: string;
}

const SEMANTIC_NODES: GraphNode[] = [
  { id: 'Origin', group: 1, val: 20, targetPosition: new THREE.Vector3(0, 0, 0), color: new THREE.Color('#FFD700') },
  { id: 'Obsidian_Vault', group: 2, val: 15, targetPosition: new THREE.Vector3(-4, 2, -2), color: new THREE.Color('#00FFFF') },
  { id: 'Real_Estate_Data', group: 3, val: 10, targetPosition: new THREE.Vector3(4, 1, 1), color: new THREE.Color('#00BFFF') },
  { id: 'Legal_Precedents', group: 3, val: 10, targetPosition: new THREE.Vector3(3, -2, -1), color: new THREE.Color('#00BFFF') },
  { id: 'Client_A', group: 4, val: 5, targetPosition: new THREE.Vector3(-2, -3, 2), color: new THREE.Color('#87CEEB') },
  { id: 'Client_B', group: 4, val: 5, targetPosition: new THREE.Vector3(1, 3, -3), color: new THREE.Color('#87CEEB') },
];

const SEMANTIC_LINKS: GraphLink[] = [
  { source: 'Origin', target: 'Obsidian_Vault' },
  { source: 'Origin', target: 'Real_Estate_Data' },
  { source: 'Origin', target: 'Legal_Precedents' },
  { source: 'Real_Estate_Data', target: 'Client_A' },
  { source: 'Real_Estate_Data', target: 'Client_B' },
  { source: 'Obsidian_Vault', target: 'Legal_Precedents' },
];

// ─── Types ───
interface ParticleData {
  id: number;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  homeNodeIndex: number; // Which semantic node this particle orbits
}

interface SingularityLayerProps {
  scrollProgress: React.MutableRefObject<{ progress: number; velocity: number }>;
  audioDataRef: React.RefObject<AudioData | null>;
  onConverged?: () => void;
}

// ─── Utilities ───
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ─── Component: SingularityLayer ───
export default function SingularityLayer({ scrollProgress, audioDataRef, onConverged }: SingularityLayerProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [converged, setConverged] = useState(false);

  const PARTICLE_COUNT = 280;
  const CONNECTION_DISTANCE = 3.2;
  const MAX_CONNECTIONS_PER_NODE = 15;

  // ─── Build particle system: semantic nodes + data dust ───
  const { particles, semanticIndices, linePositions, lineColors } = useMemo(() => {
    const ps: ParticleData[] = [];

    // 1. Create semantic nodes (the "major" nodes)
    SEMANTIC_NODES.forEach((node, idx) => {
      const spawnR = 15 + Math.random() * 10;
      const spawnTheta = Math.random() * Math.PI * 2;
      const spawnPhi = Math.acos(2 * Math.random() - 1);

      ps.push({
        id: idx,
        position: new THREE.Vector3(
          spawnR * Math.sin(spawnPhi) * Math.cos(spawnTheta),
          spawnR * Math.sin(spawnPhi) * Math.sin(spawnTheta),
          spawnR * Math.cos(spawnPhi)
        ),
        targetPosition: node.targetPosition.clone(),
        velocity: new THREE.Vector3(),
        color: node.color.clone(),
        homeNodeIndex: idx,
      });
    });

    const semanticIdxs = SEMANTIC_NODES.map((_, i) => i);

    // 2. Create data dust particles that orbit semantic nodes
    for (let i = SEMANTIC_NODES.length; i < PARTICLE_COUNT; i++) {
      const homeIdx = Math.floor(Math.random() * SEMANTIC_NODES.length);
      const homeNode = SEMANTIC_NODES[homeIdx];

      // Random spawn position (explosive distribution)
      const spawnR = 20 + Math.random() * 20;
      const spawnTheta = Math.random() * Math.PI * 2;
      const spawnPhi = Math.acos(2 * Math.random() - 1);

      // Target: orbit around home node
      const orbitR = 1.5 + Math.random() * 2.5;
      const orbitTheta = Math.random() * Math.PI * 2;
      const orbitPhi = Math.acos(2 * Math.random() - 1);
      const target = new THREE.Vector3(
        homeNode.targetPosition.x + orbitR * Math.sin(orbitPhi) * Math.cos(orbitTheta),
        homeNode.targetPosition.y + orbitR * Math.sin(orbitPhi) * Math.sin(orbitTheta),
        homeNode.targetPosition.z + orbitR * Math.cos(orbitPhi)
      );

      // Dust color: slightly dimmed version of home node
      const dustColor = homeNode.color.clone();
      dustColor.multiplyScalar(0.6 + Math.random() * 0.3);

      ps.push({
        id: i,
        position: new THREE.Vector3(
          spawnR * Math.sin(spawnPhi) * Math.cos(spawnTheta),
          spawnR * Math.sin(spawnPhi) * Math.sin(spawnTheta),
          spawnR * Math.cos(spawnPhi)
        ),
        targetPosition: target,
        velocity: new THREE.Vector3(),
        color: dustColor,
        homeNodeIndex: homeIdx,
      });
    }

    const maxLines = PARTICLE_COUNT * MAX_CONNECTIONS_PER_NODE;
    const lPos = new Float32Array(maxLines * 6);
    const lCol = new Float32Array(maxLines * 6);

    return { particles: ps, semanticIndices: semanticIdxs, linePositions: lPos, lineColors: lCol };
  }, []);

  const particlePositions = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    particles.forEach((p, i) => {
      arr[i * 3] = p.position.x;
      arr[i * 3 + 1] = p.position.y;
      arr[i * 3 + 2] = p.position.z;
    });
    return arr;
  }, [particles]);

  const particleColors = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    particles.forEach((p, i) => {
      arr[i * 3] = p.color.r;
      arr[i * 3 + 1] = p.color.g;
      arr[i * 3 + 2] = p.color.b;
    });
    return arr;
  }, [particles]);

  const particleSizes = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT);
    particles.forEach((_p, i) => {
      // Semantic nodes are larger; dust is smaller
      const isSemantic = semanticIndices.includes(i);
      arr[i] = isSemantic ? 0.5 + Math.random() * 0.3 : 0.08 + Math.random() * 0.12;
    });
    return arr;
  }, [particles, semanticIndices]);

  useEffect(() => {
    if (converged && onConverged) onConverged();
  }, [converged, onConverged]);

  useFrame(({ clock }) => {
    if (!pointsRef.current || !linesRef.current) return;

    const p = scrollProgress.current.progress;
    const t = clock.getElapsedTime();

    // ═══════════════════════════════════════════════
    // THE CRYSTALLIZATION TIMING (The Final Handshake)
    // ═══════════════════════════════════════════════
    // 0.55-0.65: Big Bang fading → Singularity invisible
    // 0.58-0.72: Singularity IGNITES from the center
    // 0.60-0.78: Particles still turbulent from explosion
    // 0.72-0.92: Particles CONVERGE to graph structure
    // 0.92-1.00: Graph is stable, breathing

    const activation = smoothstep(0.58, 0.72, p);
    if (activation <= 0.001) return;

    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute;

    let lineIdx = 0;

    const explodePhase = 1.0 - smoothstep(0.60, 0.78, p);
    const convergePhase = smoothstep(0.72, 0.92, p);
    const breathePhase = smoothstep(0.92, 1.0, p);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const particle = particles[i];
      const isSemantic = semanticIndices.includes(i);

      // ─── Turbulence from the dying explosion ───
      const noise = Math.sin(t * 2.5 + particle.id) * Math.cos(t * 1.8 + particle.id * 0.1);
      const turbulence = new THREE.Vector3(
        noise * explodePhase * (isSemantic ? 1.5 : 3),
        Math.cos(t * 1.5 + particle.id * 0.2) * explodePhase * (isSemantic ? 1.5 : 3),
        Math.sin(t * 1.0 + particle.id * 0.3) * explodePhase * (isSemantic ? 1.5 : 3)
      );

      // ─── Breathing animation when fully converged ───
      if (breathePhase > 0) {
        const breathe = Math.sin(t * 0.8 + particle.id * 0.5) * 0.08 * breathePhase;
        const breatheDir = particle.targetPosition.clone().normalize();
        particle.targetPosition.add(breatheDir.multiplyScalar(breathe));
      }

      // ─── Attraction to target (the "crystallization" force) ───
      const toTarget = new THREE.Vector3().subVectors(particle.targetPosition, particle.position);
      const distToTarget = toTarget.length();
      const attractionStrength = isSemantic ? 0.025 : 0.018;
      toTarget.normalize().multiplyScalar(distToTarget * attractionStrength * convergePhase);

      // ─── Physics integration ───
      const damping = isSemantic ? 0.93 : 0.90;
      particle.velocity.multiplyScalar(damping);
      particle.velocity.add(toTarget);
      particle.velocity.add(turbulence.multiplyScalar(0.008));
      particle.position.add(particle.velocity);

      posAttr.setXYZ(i, particle.position.x, particle.position.y, particle.position.z);

      // ─── Color: white-hot during explosion → semantic color ───
      const baseColor = particle.color.clone();
      if (explodePhase > 0.05) {
        // White-hot core during settling
        baseColor.lerp(new THREE.Color(1, 0.95, 0.85), explodePhase * 0.75);
      }
      // Pulse brighter when converged
      if (convergePhase > 0.5) {
        const pulse = Math.sin(t * 2 + particle.id) * 0.1 * convergePhase;
        baseColor.multiplyScalar(1.0 + pulse);
      }
      colAttr.setXYZ(i, baseColor.r, baseColor.g, baseColor.b);

      // ─── Connections: only semantic nodes link, and only when converged ───
      if (isSemantic && convergePhase > 0.25 && lineIdx < linePositions.length / 6 - MAX_CONNECTIONS_PER_NODE) {
        // Find other semantic nodes that are linked in the graph data
        const currentId = SEMANTIC_NODES[semanticIndices.indexOf(i)]?.id;
        if (!currentId) continue;

        const linkedTargets = SEMANTIC_LINKS
          .filter((l) => l.source === currentId)
          .map((l) => l.target);

        for (let j = i + 1; j < PARTICLE_COUNT; j++) {
          if (!semanticIndices.includes(j)) continue;
          const otherId = SEMANTIC_NODES[semanticIndices.indexOf(j)]?.id;
          if (!otherId || !linkedTargets.includes(otherId)) continue;

          const other = particles[j];
          const dist = particle.position.distanceTo(other.position);
          if (dist < CONNECTION_DISTANCE * 1.5) {
            const alpha = (1 - dist / (CONNECTION_DISTANCE * 1.5)) * convergePhase * 0.5;

            const baseIdx = lineIdx * 6;
            linePositions[baseIdx] = particle.position.x;
            linePositions[baseIdx + 1] = particle.position.y;
            linePositions[baseIdx + 2] = particle.position.z;
            linePositions[baseIdx + 3] = other.position.x;
            linePositions[baseIdx + 4] = other.position.y;
            linePositions[baseIdx + 5] = other.position.z;

            lineColors[baseIdx] = baseColor.r * alpha;
            lineColors[baseIdx + 1] = baseColor.g * alpha;
            lineColors[baseIdx + 2] = baseColor.b * alpha;
            lineColors[baseIdx + 3] = other.color.r * alpha;
            lineColors[baseIdx + 4] = other.color.g * alpha;
            lineColors[baseIdx + 5] = other.color.b * alpha;

            lineIdx++;
          }
        }
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Update lines
    const lineGeo = linesRef.current.geometry as THREE.BufferGeometry;
    lineGeo.setDrawRange(0, lineIdx * 2);
    (lineGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (lineGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // Slow cosmic rotation
    pointsRef.current.rotation.y = t * 0.015;
    linesRef.current.rotation.y = t * 0.015;

    // Pass activation to shader for cross-fade opacity
    if (materialRef.current) {
      materialRef.current.uniforms.uActivation.value = activation;
    }

    if (convergePhase > 0.95 && !converged) {
      setConverged(true);
    }
  });

  return (
    <group renderOrder={3}>
      {/* ═══ The Voice Orb: The Sun at the Center ═══ */}
      <VoiceOrb audioDataRef={audioDataRef} scrollProgress={scrollProgress} />

      {/* ═══ Semantic Nodes + Data Dust Particles ═══ */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={particlePositions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={particleColors} itemSize={3} />
          <bufferAttribute attach="attributes-size" count={PARTICLE_COUNT} array={particleSizes} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          uniforms={{
            uActivation: { value: 0.0 },
          }}
          vertexShader={/* glsl */ `
            attribute float size;
            attribute vec3 color;
            varying vec3 vColor;
            varying float vDist;
            void main() {
              vColor = color;
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              vDist = -mvPosition.z;
              gl_PointSize = size * (400.0 / vDist);
              gl_Position = projectionMatrix * mvPosition;
            }
          `}
          fragmentShader={/* glsl */ `
            uniform float uActivation;
            varying vec3 vColor;
            varying float vDist;
            void main() {
              float d = length(gl_PointCoord - 0.5);
              if (d > 0.5) discard;
              float glow = 1.0 - smoothstep(0.0, 0.5, d);
              glow = pow(glow, 2.2);
              // Distance attenuation
              float fade = smoothstep(60.0, 10.0, vDist);
              // Cross-fade: particles fade in as activation grows
              gl_FragColor = vec4(vColor, glow * fade * uActivation);
            }
          `}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          vertexColors
        />
      </points>

      {/* ═══ Semantic Links ═══ */}
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={linePositions.length / 3} array={linePositions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={lineColors.length / 3} array={lineColors} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={0.35} blending={THREE.AdditiveBlending} />
      </lineSegments>
    </group>
  );
}

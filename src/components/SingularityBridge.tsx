import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface NodeData {
  id: number;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
}

interface SingularityBridgeProps {
  scrollProgress: React.MutableRefObject<{ progress: number; velocity: number }>;
  onHandoff?: () => void;
}

export default function SingularityBridge({ scrollProgress, onHandoff }: SingularityBridgeProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const [handoffComplete, setHandoffComplete] = useState(false);

  const NODE_COUNT = 300;
  const CONNECTION_DISTANCE = 3.5;

  const { nodes, linePositions, lineColors } = useMemo(() => {
    const ns: NodeData[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const theta = (i / NODE_COUNT) * Math.PI * 2 * 10;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / NODE_COUNT);
      const r = 8 + Math.random() * 4;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      const targetX = (Math.random() - 0.5) * 20;
      const targetY = (Math.random() - 0.5) * 12;
      const targetZ = (Math.random() - 0.5) * 10;

      const color = new THREE.Color();
      const hue = (i / NODE_COUNT) * 0.3 + 0.55;
      color.setHSL(hue, 0.8, 0.6);

      ns.push({
        id: i,
        position: new THREE.Vector3(x * 3, y * 3, z * 3),
        targetPosition: new THREE.Vector3(targetX, targetY, targetZ),
        velocity: new THREE.Vector3(),
        color,
      });
    }

    // Pre-allocate line arrays (max connections estimate)
    const maxLines = NODE_COUNT * 6;
    const lPos = new Float32Array(maxLines * 6);
    const lCol = new Float32Array(maxLines * 6);

    return { nodes: ns, linePositions: lPos, lineColors: lCol };
  }, []);

  const nodePositions = useMemo(() => {
    const arr = new Float32Array(NODE_COUNT * 3);
    nodes.forEach((n, i) => {
      arr[i * 3] = n.position.x;
      arr[i * 3 + 1] = n.position.y;
      arr[i * 3 + 2] = n.position.z;
    });
    return arr;
  }, [nodes]);

  const nodeColors = useMemo(() => {
    const arr = new Float32Array(NODE_COUNT * 3);
    nodes.forEach((n, i) => {
      arr[i * 3] = n.color.r;
      arr[i * 3 + 1] = n.color.g;
      arr[i * 3 + 2] = n.color.b;
    });
    return arr;
  }, [nodes]);

  const nodeSizes = useMemo(() => {
    const arr = new Float32Array(NODE_COUNT);
    for (let i = 0; i < NODE_COUNT; i++) arr[i] = 0.15 + Math.random() * 0.25;
    return arr;
  }, []);

  useEffect(() => {
    if (handoffComplete && onHandoff) onHandoff();
  }, [handoffComplete, onHandoff]);

  useFrame(({ clock }) => {
    if (!pointsRef.current || !linesRef.current) return;

    const p = scrollProgress.current.progress;
    const t = clock.getElapsedTime();

    // Activation window: 0.55 -> 1.0
    const activation = smoothstep(0.55, 0.70, p);
    if (activation <= 0.001) return;

    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute;

    let lineIdx = 0;

    // Snap physics: explode outward then converge to graph
    const explodePhase = 1.0 - smoothstep(0.60, 0.75, p);
    const convergePhase = smoothstep(0.70, 0.90, p);

    for (let i = 0; i < NODE_COUNT; i++) {
      const node = nodes[i];

      // Add turbulence from "explosion" settling
      const noise = Math.sin(t * 2 + node.id) * Math.cos(t * 1.5 + node.id * 0.1);
      const turbulence = new THREE.Vector3(
        noise * explodePhase * 2,
        Math.cos(t * 1.2 + node.id * 0.2) * explodePhase * 2,
        Math.sin(t * 0.8 + node.id * 0.3) * explodePhase * 2
      );

      // Target attraction
      const toTarget = new THREE.Vector3().subVectors(node.targetPosition, node.position);
      const distToTarget = toTarget.length();
      toTarget.normalize().multiplyScalar(distToTarget * 0.03 * convergePhase);

      // Damping
      node.velocity.multiplyScalar(0.92);
      node.velocity.add(toTarget);
      node.velocity.add(turbulence.multiplyScalar(0.01));

      node.position.add(node.velocity);

      posAttr.setXYZ(i, node.position.x, node.position.y, node.position.z);

      // Color shift: white-hot during explosion → graph color
      const baseColor = node.color.clone();
      if (explodePhase > 0.1) {
        baseColor.lerp(new THREE.Color(1, 0.95, 0.9), explodePhase * 0.7);
      }
      colAttr.setXYZ(i, baseColor.r, baseColor.g, baseColor.b);

      // Connections (only when converged enough)
      if (convergePhase > 0.3 && lineIdx < linePositions.length / 6 - 10) {
        for (let j = i + 1; j < Math.min(i + 20, NODE_COUNT); j++) {
          const other = nodes[j];
          const dist = node.position.distanceTo(other.position);
          if (dist < CONNECTION_DISTANCE) {
            const alpha = (1 - dist / CONNECTION_DISTANCE) * convergePhase * 0.4;

            linePositions[lineIdx * 6] = node.position.x;
            linePositions[lineIdx * 6 + 1] = node.position.y;
            linePositions[lineIdx * 6 + 2] = node.position.z;
            linePositions[lineIdx * 6 + 3] = other.position.x;
            linePositions[lineIdx * 6 + 4] = other.position.y;
            linePositions[lineIdx * 6 + 5] = other.position.z;

            lineColors[lineIdx * 6] = baseColor.r * alpha;
            lineColors[lineIdx * 6 + 1] = baseColor.g * alpha;
            lineColors[lineIdx * 6 + 2] = baseColor.b * alpha;
            lineColors[lineIdx * 6 + 3] = other.color.r * alpha;
            lineColors[lineIdx * 6 + 4] = other.color.g * alpha;
            lineColors[lineIdx * 6 + 5] = other.color.b * alpha;

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

    // Slow rotation of entire graph
    pointsRef.current.rotation.y = t * 0.02;
    linesRef.current.rotation.y = t * 0.02;

    if (convergePhase > 0.95 && !handoffComplete) {
      setHandoffComplete(true);
    }
  });

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={NODE_COUNT} array={nodePositions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={NODE_COUNT} array={nodeColors} itemSize={3} />
          <bufferAttribute attach="attributes-size" count={NODE_COUNT} array={nodeSizes} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={/* glsl */ `
            attribute float size;
            varying vec3 vColor;
            void main() {
              vColor = color;
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = size * (300.0 / -mvPosition.z);
              gl_Position = projectionMatrix * mvPosition;
            }
          `}
          fragmentShader={/* glsl */ `
            varying vec3 vColor;
            void main() {
              float d = length(gl_PointCoord - 0.5);
              if (d > 0.5) discard;
              float glow = 1.0 - smoothstep(0.0, 0.5, d);
              glow = pow(glow, 2.0);
              gl_FragColor = vec4(vColor, glow);
            }
          `}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          vertexColors
        />
      </points>
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={linePositions.length / 3} array={linePositions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={lineColors.length / 3} array={lineColors} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={0.3} blending={THREE.AdditiveBlending} />
      </lineSegments>
    </group>
  );
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

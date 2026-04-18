import { Suspense, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import GenesisContainer from './components/GenesisContainer';
import VoidLayer from './components/VoidLayer';
import { BigBangLayer } from './components/genesis/BigBangLayer';
import SingularityLayer from './components/genesis/SingularityLayer';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';
import Dashboard from './components/dashboard/Dashboard';
import { DashboardProvider, useDashboard } from './components/dashboard/DashboardContext';
import type { AudioData } from './types/audio';

// ─── Mock node data for click demo ───
const MOCK_NODES: Record<string, {
  id: string; title: string; tags: string[]; filePath: string; summary: string; connections: string[];
}> = {
  Origin: {
    id: 'Origin',
    title: 'Origin',
    tags: ['core', 'root'],
    filePath: '/vault/system/origin.md',
    summary: 'The central nexus of the I.N.F.I.N.I.T.E. intelligence network. All data streams converge here before distribution to specialized nodes.',
    connections: ['Obsidian_Vault', 'Real_Estate_Data', 'Legal_Precedents'],
  },
  Obsidian_Vault: {
    id: 'Obsidian_Vault',
    title: 'Obsidian Vault',
    tags: ['storage', 'knowledge-base'],
    filePath: '/vault/system/obsidian_vault.md',
    summary: 'The primary knowledge repository. Contains structured markdown notes, linked references, and semantic metadata for the entire data corpus.',
    connections: ['Origin', 'Legal_Precedents'],
  },
  Real_Estate_Data: {
    id: 'Real_Estate_Data',
    title: 'Real Estate Data',
    tags: ['data', 'reit', 'pipeline'],
    filePath: '/vault/data/real_estate_index.md',
    summary: 'Aggregated real estate intelligence including property valuations, market trends, zoning data, and development pipeline tracking.',
    connections: ['Origin', 'Client_A', 'Client_B'],
  },
  Legal_Precedents: {
    id: 'Legal_Precedents',
    title: 'Legal Precedents',
    tags: ['legal', 'compliance', 'risk'],
    filePath: '/vault/legal/precedents_index.md',
    summary: 'Case law database and regulatory compliance framework. Tracks legal precedents relevant to land assembly and crown land submissions.',
    connections: ['Origin', 'Obsidian_Vault'],
  },
  Client_A: {
    id: 'Client_A',
    title: 'Client A Profile',
    tags: ['client', 'buyer'],
    filePath: '/vault/clients/client_a.md',
    summary: 'Institutional buyer profile with acquisition criteria, capital deployment timeline, and preferred asset classes.',
    connections: ['Real_Estate_Data'],
  },
  Client_B: {
    id: 'Client_B',
    title: 'Client B Profile',
    tags: ['client', 'developer'],
    filePath: '/vault/clients/client_b.md',
    summary: 'Land assembly developer with focus on infill sites. Active pipeline includes 5 under-contract properties in the Golden Horseshoe.',
    connections: ['Real_Estate_Data'],
  },
};

interface SceneProps {
  scrollProgress: React.MutableRefObject<{ progress: number; velocity: number }>;
  audioDataRef: React.RefObject<AudioData | null>;
  onNodeClick: (id: string) => void;
}

function Scene({ scrollProgress, audioDataRef, onNodeClick }: SceneProps) {
  return (
    <>
      <group renderOrder={1}>
        <VoidLayer scrollProgress={scrollProgress} />
      </group>
      <BigBangLayer scrollProgress={scrollProgress} />
      <group renderOrder={3}>
        <SingularityLayer
          scrollProgress={scrollProgress}
          audioDataRef={audioDataRef}
          onNodeClick={onNodeClick}
        />
      </group>
    </>
  );
}

// ─── Inner App: Has access to Dashboard context ───
function AppInner() {
  const { audioDataRef, isActive, error, start } = useAudioAnalyzer();
  const { openHUD } = useDashboard();

  const handleNodeClick = useCallback((id: string) => {
    const node = MOCK_NODES[id];
    if (node) openHUD(node);
  }, [openHUD]);

  return (
    <>
      <GenesisContainer>
        {(scrollProgress) => (
          <Canvas
            camera={{ position: [0, 0, 20], fov: 60, near: 0.1, far: 1000 }}
            gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
            dpr={[1, 2]}
            style={{ background: '#000000' }}
          >
            <Suspense fallback={null}>
              <Scene
                scrollProgress={scrollProgress}
                audioDataRef={audioDataRef}
                onNodeClick={handleNodeClick}
              />
            </Suspense>
          </Canvas>
        )}
      </GenesisContainer>

      {/* Dashboard UI layers — always render, audio is optional */}
      <Dashboard audioDataRef={audioDataRef} />

      {/* Awakening overlay */}
      {!isActive && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ textAlign: 'center', color: '#fff', fontFamily: 'monospace', letterSpacing: '0.2em' }}>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '1.5rem' }}>
              THE VOID IS SILENT
            </p>
            <button
              onClick={start}
              style={{
                padding: '1rem 2.5rem',
                fontSize: '13px',
                fontFamily: 'monospace',
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: '#FFD700',
                background: 'transparent',
                border: '1px solid rgba(255, 215, 0, 0.4)',
                borderRadius: '2px',
                cursor: 'pointer',
                transition: 'all 0.4s ease',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#FFD700';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.4)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              Awaken the Singularity
            </button>
            {error && (
              <p style={{ marginTop: '1rem', fontSize: '11px', color: '#ff4444', maxWidth: '320px' }}>
                {error}
              </p>
            )}
            <p style={{ marginTop: '1.5rem', fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
              Microphone access required for audio-visual synchronization
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <DashboardProvider>
      <AppInner />
    </DashboardProvider>
  );
}

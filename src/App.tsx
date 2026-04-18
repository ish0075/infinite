import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import GenesisContainer from './components/GenesisContainer';
import VoidLayer from './components/VoidLayer';
import { BigBangLayer } from './components/genesis/BigBangLayer';
import SingularityLayer from './components/genesis/SingularityLayer';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';
import type { AudioData } from './types/audio';

interface SceneProps {
  scrollProgress: React.MutableRefObject<{ progress: number; velocity: number }>;
  audioDataRef: React.RefObject<AudioData | null>;
}

function Scene({ scrollProgress, audioDataRef }: SceneProps) {
  return (
    <>
      {/* Act I: The Void — deep background */}
      <group renderOrder={1}>
        <VoidLayer scrollProgress={scrollProgress} />
      </group>

      {/* Act II: The Big Bang — pure energy, mathematically forged */}
      <BigBangLayer scrollProgress={scrollProgress} />

      {/* Act III: The Singularity — chaos crystallizes into structure */}
      <group renderOrder={3}>
        <SingularityLayer
          scrollProgress={scrollProgress}
          audioDataRef={audioDataRef}
        />
      </group>
    </>
  );
}

export default function App() {
  const { audioDataRef, isActive, error, start } = useAudioAnalyzer();

  return (
    <>
      {/* ═══ Fixed 3D Canvas Layer ═══ */}
      <GenesisContainer>
        {(scrollProgress) => (
          <Canvas
            camera={{ position: [0, 0, 20], fov: 60, near: 0.1, far: 1000 }}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: 'high-performance',
            }}
            dpr={[1, 2]}
            style={{ background: '#000000' }}
          >
            <Suspense fallback={null}>
              <Scene scrollProgress={scrollProgress} audioDataRef={audioDataRef} />
            </Suspense>
          </Canvas>
        )}
      </GenesisContainer>

      {/* ═══ Audio Awakening Overlay ═══ */}
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
            transition: 'opacity 0.8s ease',
          }}
        >
          <div
            style={{
              textAlign: 'center',
              color: '#fff',
              fontFamily: 'monospace',
              letterSpacing: '0.2em',
            }}
          >
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

      {/* ═══ Active Status Indicator ═══ */}
      {isActive && (
        <div
          style={{
            position: 'fixed',
            top: '1.5rem',
            right: '1.5rem',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontFamily: 'monospace',
            fontSize: '10px',
            letterSpacing: '0.2em',
            color: 'rgba(0, 255, 255, 0.5)',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#00FFFF',
              boxShadow: '0 0 8px #00FFFF',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          LISTENING
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 0.4; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.3); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}

import { useDashboard } from './DashboardContext';

export default function KnowledgeHUD() {
  const { selectedNode, hudOpen, closeHUD } = useDashboard();

  if (!selectedNode) return null;

  return (
    <>
      {/* Backdrop overlay (click to close) */}
      {hudOpen && (
        <div
          onClick={closeHUD}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(2px)',
            pointerEvents: 'auto',
            animation: 'fadeIn 0.2s ease',
          }}
        />
      )}

      {/* Side panel */}
      <div
        style={{
          position: 'fixed',
          top: '44px',
          right: 0,
          bottom: 0,
          width: 'min(400px, 85vw)',
          zIndex: 45,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          transform: hudOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <h2
              style={{
                color: '#FFD700',
                fontFamily: 'monospace',
                fontSize: '14px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                margin: 0,
                marginBottom: '0.5rem',
              }}
            >
              {selectedNode.title}
            </h2>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {selectedNode.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(0, 255, 255, 0.08)',
                    color: '#00FFFF',
                    fontFamily: 'monospace',
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={closeHUD}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '0.25rem',
              lineHeight: 1,
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          {/* File Path */}
          <Section title="Source">
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '10px',
                color: 'rgba(255,255,255,0.4)',
                letterSpacing: '0.05em',
                wordBreak: 'break-all',
                padding: '0.75rem',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {selectedNode.filePath}
            </div>
          </Section>

          {/* Intelligence Summary */}
          <Section title="Intelligence Summary">
            <p
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.7)',
                lineHeight: 1.7,
                letterSpacing: '0.02em',
                margin: 0,
              }}
            >
              {selectedNode.summary}
            </p>
          </Section>

          {/* Connection Map */}
          <Section title="Connection Map">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {selectedNode.connections.map((conn) => (
                <div
                  key={conn}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,255,255,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                >
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#00FFFF',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      color: 'rgba(255,255,255,0.6)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {conn}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        style={{
          fontFamily: 'monospace',
          fontSize: '9px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.35)',
          margin: '0 0 0.75rem 0',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

import { useDashboard } from './DashboardContext';

export default function SystemTelemetry() {
  const { systemStatus } = useDashboard();
  const { llm, vault, audio } = systemStatus;

  const statusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'active':
        return '#00FF88';
      case 'loading':
      case 'syncing':
        return '#FFD700';
      default:
        return '#FF4444';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '44px',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.5rem',
        background: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        fontFamily: 'monospace',
        fontSize: '10px',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        pointerEvents: 'auto',
      }}
    >
      {/* Left: Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.6)' }}>
        <span style={{ color: '#FFD700', fontWeight: 700 }}>I.N.F.I.N.I.T.E.</span>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
        <span>Genesis Protocol</span>
      </div>

      {/* Center: System Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        {/* LLM Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>LLM</span>
          <span style={{ color: '#00FFFF' }}>{llm.name}</span>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: statusColor(llm.status),
              boxShadow: `0 0 6px ${statusColor(llm.status)}`,
            }}
          />
        </div>

        {/* Vault Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Vault</span>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>{vault.name}</span>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: statusColor(vault.syncStatus),
              boxShadow: `0 0 6px ${statusColor(vault.syncStatus)}`,
            }}
          />
        </div>
      </div>

      {/* Right: Audio Telemetry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>Audio</span>
        <AudioWaveform active={audio.active} amplitude={audio.amplitude} />
        <span style={{ color: audio.active ? '#00FFFF' : 'rgba(255,255,255,0.3)', minWidth: '36px', textAlign: 'right' }}>
          {audio.active ? 'ACTIVE' : 'STANDBY'}
        </span>
      </div>
    </div>
  );
}

function AudioWaveform({ active, amplitude }: { active: boolean; amplitude: number }) {
  const bars = 8;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '14px' }}>
      {Array.from({ length: bars }).map((_, i) => {
        const baseHeight = active ? 3 + Math.random() * 8 * amplitude : 2;
        const height = Math.max(2, baseHeight);
        return (
          <div
            key={i}
            style={{
              width: '2px',
              height: `${height}px`,
              background: active ? '#00FFFF' : 'rgba(255,255,255,0.15)',
              borderRadius: '1px',
              transition: 'height 0.1s ease, background 0.2s ease',
            }}
          />
        );
      })}
    </div>
  );
}

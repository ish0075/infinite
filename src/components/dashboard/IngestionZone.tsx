import { useState, useCallback, useRef } from 'react';
import { autoChunk } from '../../services/ingestion/chunker';
import { ingestChunks } from '../../services/ingestion/client';

interface IngestionZoneProps {
  audioDataRef?: React.RefObject<{ bass: number; mid: number; treble: number; volume: number; thinking?: number; ingestionPulse?: number } | null>;
  onIngestComplete?: (result: { inserted: number; title: string }) => void;
}

type IngestPhase = 'idle' | 'reading' | 'chunking' | 'embedding' | 'storing' | 'complete' | 'error';

const PHASE_LABELS: Record<IngestPhase, string> = {
  idle: 'Drop files here',
  reading: 'Reading file...',
  chunking: 'Breaking into chunks...',
  embedding: 'Embedding vectors...',
  storing: 'Storing in vault...',
  complete: 'Ingested ✓',
  error: 'Failed ✗',
};

const SUPPORTED_EXT = new Set(['.txt', '.md', '.csv', '.json']);

export default function IngestionZone({ audioDataRef, onIngestComplete }: IngestionZoneProps) {
  const [phase, setPhase] = useState<IngestPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const reset = useCallback(() => {
    setPhase('idle');
    setProgress(0);
    setFileName('');
    if (audioDataRef?.current) audioDataRef.current.ingestionPulse = 0;
  }, [audioDataRef]);

  const processFile = useCallback(
    async (file: File) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!SUPPORTED_EXT.has(ext)) {
        setPhase('error');
        setFileName('Unsupported: ' + file.name);
        errorTimerRef.current = setTimeout(reset, 3000);
        return;
      }

      setFileName(file.name);
      setPhase('reading');
      if (audioDataRef?.current) audioDataRef.current.ingestionPulse = 0.3;

      try {
        // 1. Read file as text
        const text = await file.text();
        setProgress(0.15);

        // 2. Chunk
        setPhase('chunking');
        const chunks = autoChunk(text, file.name);
        setProgress(0.35);

        if (chunks.length === 0) {
          throw new Error('No extractable text');
        }

        // 3. Embed + Store (server does both)
        setPhase('embedding');
        if (audioDataRef?.current) audioDataRef.current.ingestionPulse = 0.7;
        setProgress(0.5);

        const result = await ingestChunks({
          chunks,
          metadata: {
            title: file.name.replace(ext, ''),
            source: file.name,
            tags: ['ingested', ext.slice(1)],
          },
        });

        setProgress(1);
        setPhase('complete');
        if (audioDataRef?.current) audioDataRef.current.ingestionPulse = 0;

        onIngestComplete?.({ inserted: result.inserted, title: result.metadata.title });

        // Auto-reset after showing success
        setTimeout(reset, 2500);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ingestion failed';
        console.error('[IngestionZone]', msg);
        setPhase('error');
        if (audioDataRef?.current) audioDataRef.current.ingestionPulse = 0;
        errorTimerRef.current = setTimeout(reset, 4000);
      }
    },
    [audioDataRef, onIngestComplete, reset]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        processFile(files[0]); // One at a time for clarity
      }
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          zIndex: 50,
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          border: '1px solid rgba(255, 215, 0, 0.3)',
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(12px)',
          color: '#FFD700',
          fontSize: '20px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
        }}
        title="Open ingestion portal"
      >
        ↓
      </button>
    );
  }

  const isActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error';

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        zIndex: 50,
        width: '280px',
        pointerEvents: 'auto',
      }}
    >
      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(true)}
        style={{
          position: 'absolute',
          top: '-12px',
          right: '8px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.5)',
          fontSize: '12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </button>

      {/* Glow ring */}
      <div
        style={{
          position: 'absolute',
          inset: '-2px',
          borderRadius: '14px',
          background: isDragOver
            ? 'linear-gradient(135deg, rgba(255,215,0,0.3), rgba(0,255,255,0.3))'
            : isActive
              ? 'linear-gradient(135deg, rgba(0,255,255,0.2), rgba(255,215,0,0.2))'
              : 'transparent',
          filter: `blur(${isDragOver || isActive ? 12 : 0}px)`,
          opacity: isDragOver || isActive ? 1 : 0,
          transition: 'all 0.3s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Main drop zone */}
      <div
        style={{
          position: 'relative',
          padding: '1rem',
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '12px',
          border: `1px solid ${
            phase === 'error'
              ? 'rgba(255, 80, 80, 0.4)'
              : phase === 'complete'
                ? 'rgba(0, 255, 128, 0.3)'
                : isDragOver
                  ? 'rgba(255, 215, 0, 0.4)'
                  : 'rgba(255, 255, 255, 0.08)'
          }`,
          transition: 'all 0.3s ease',
          textAlign: 'center',
        }}
      >
        {/* Status icon */}
        <div
          style={{
            width: '40px',
            height: '40px',
            margin: '0 auto 0.5rem',
            borderRadius: '50%',
            border: `2px solid ${
              phase === 'error'
                ? 'rgba(255,80,80,0.5)'
                : phase === 'complete'
                  ? 'rgba(0,255,128,0.5)'
                  : isActive || isDragOver
                    ? 'rgba(255,215,0,0.5)'
                    : 'rgba(255,255,255,0.15)'
            }`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            transition: 'all 0.3s ease',
            animation: isActive ? 'spin 1.5s linear infinite' : 'none',
          }}
        >
          {phase === 'error' ? '!' : phase === 'complete' ? '✓' : isDragOver ? '↓' : '◉'}
        </div>

        {/* Phase label */}
        <div
          style={{
            color:
              phase === 'error'
                ? '#ff8080'
                : phase === 'complete'
                  ? '#00ff80'
                  : '#FFD700',
            fontFamily: 'monospace',
            fontSize: '11px',
            letterSpacing: '0.1em',
            marginBottom: '0.25rem',
          }}
        >
          {PHASE_LABELS[phase]}
        </div>

        {/* Filename */}
        {fileName && (
          <div
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontFamily: 'monospace',
              fontSize: '10px',
              marginBottom: '0.5rem',
              wordBreak: 'break-all',
            }}
          >
            {fileName}
          </div>
        )}

        {/* Progress bar */}
        {isActive && (
          <div
            style={{
              width: '100%',
              height: '3px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '2px',
              overflow: 'hidden',
              marginTop: '0.5rem',
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #FFD700, #00FFFF)',
                borderRadius: '2px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        )}

        {/* Supported formats hint */}
        {phase === 'idle' && (
          <div
            style={{
              color: 'rgba(255,255,255,0.3)',
              fontFamily: 'monospace',
              fontSize: '9px',
              marginTop: '0.5rem',
              letterSpacing: '0.05em',
            }}
          >
            .txt · .md · .csv · .json
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

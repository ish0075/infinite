import { useRef, useState, useEffect, useCallback } from 'react';
import { useDashboard } from './DashboardContext';
import { streamCognitiveQuery, synthesizeTTSApi } from '../../services/api/client';

interface NeuralInterfaceProps {
  audioDataRef?: React.RefObject<{ bass: number; mid: number; treble: number; volume: number; thinking?: number } | null>;
}

export default function NeuralInterface({ audioDataRef }: NeuralInterfaceProps) {
  const { query, setQueryText, setProcessing, setResponse } = useDashboard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [glowIntensity, setGlowIntensity] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const accumulatedRef = useRef('');

  // Pulse the glow in sync with audio + thinking state
  useEffect(() => {
    let raf: number;
    const update = () => {
      const audio = audioDataRef?.current;
      const baseIntensity = audio ? audio.bass * 0.6 + audio.mid * 0.3 + audio.treble * 0.1 : 0;
      const thinkBoost = audio?.thinking ? audio.thinking * 0.5 : 0;
      setGlowIntensity(Math.min(1, baseIntensity + thinkBoost));
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [audioDataRef]);

  // ─── Secure Intelligence: Streaming RAG + LLM ───
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.text.trim() || query.isProcessing) return;

      const userQuery = query.text.trim();
      setProcessing(true);
      setResponse('');
      setStreamingText('');
      accumulatedRef.current = '';

      // Set thinking state for the orb
      if (audioDataRef?.current) audioDataRef.current.thinking = 1;

      try {
        await streamCognitiveQuery(
          { text: userQuery },
          {
            onToken: (token: string) => {
              accumulatedRef.current += token;
              setStreamingText(accumulatedRef.current);
              // Pulse the orb in rhythm with token arrival
              if (audioDataRef?.current) {
                audioDataRef.current.thinking = 0.7 + Math.random() * 0.3;
              }
            },
            onThinking: (_message: string) => {
              // Soft pulse during RAG retrieval
              if (audioDataRef?.current) audioDataRef.current.thinking = 0.4;
            },
            onError: (message: string) => {
              setResponse(`⚠️ ${message}`);
              setStreamingText('');
            },
            onDone: (_metadata: any) => {
              setResponse(accumulatedRef.current);
              setStreamingText('');

              // Clear thinking state
              if (audioDataRef?.current) audioDataRef.current.thinking = 0;

              // Optional TTS via secure proxy
              if (!isSpeaking && accumulatedRef.current) {
                setIsSpeaking(true);
                synthesizeTTSApi(accumulatedRef.current)
                  .then((audioData) => {
                    const blob = new Blob([audioData], { type: 'audio/mpeg' });
                    const url = URL.createObjectURL(blob);
                    const audio = new Audio(url);
                    audio.onended = () => {
                      URL.revokeObjectURL(url);
                      setIsSpeaking(false);
                    };
                    return audio.play();
                  })
                  .catch((ttsErr) => {
                    console.warn('[TTS]', ttsErr);
                    setIsSpeaking(false);
                  });
              }
            },
          }
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'The Singularity encountered a disturbance.';
        setResponse(`⚠️ ${message}`);
        setStreamingText('');
        if (audioDataRef?.current) audioDataRef.current.thinking = 0;
      } finally {
        setProcessing(false);
      }
    },
    [query.text, query.isProcessing, isSpeaking, setProcessing, setResponse, audioDataRef]
  );

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        width: 'min(640px, 92vw)',
        pointerEvents: 'auto',
      }}
    >
      {/* Glow ring that pulses with audio */}
      <div
        style={{
          position: 'absolute',
          inset: '-2px',
          borderRadius: '14px',
          background: `linear-gradient(135deg, rgba(255,215,0,${0.15 + glowIntensity * 0.4}), rgba(0,255,255,${0.15 + glowIntensity * 0.4}))`,
          filter: `blur(${8 + glowIntensity * 12}px)`,
          opacity: 0.6 + glowIntensity * 0.4,
          transition: 'filter 0.1s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Main input container */}
      <form
        onSubmit={handleSubmit}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '12px',
          border: `1px solid rgba(255, 255, 255, ${0.08 + glowIntensity * 0.15})`,
          transition: 'border-color 0.2s ease',
        }}
      >
        {/* Voice button */}
        <button
          type="button"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: glowIntensity > 0.1
              ? `rgba(0, 255, 255, ${0.2 + glowIntensity * 0.3})`
              : 'rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.2s ease',
          }}
          title="Voice input"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={glowIntensity > 0.1 ? '#00FFFF' : 'rgba(255,255,255,0.5)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={query.text}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Command the Singularity..."
          disabled={query.isProcessing}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: '13px',
            letterSpacing: '0.05em',
            padding: '0.25rem 0',
            opacity: query.isProcessing ? 0.5 : 1,
          }}
        />

        {/* Status indicator */}
        {query.isProcessing && (
          <span style={{ fontSize: '9px', color: '#FFD700', letterSpacing: '0.2em', whiteSpace: 'nowrap' }}>
            {streamingText ? 'GENERATING...' : 'THINKING...'}
          </span>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={query.isProcessing || !query.text.trim()}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: 'none',
            background: query.isProcessing
              ? 'rgba(255, 215, 0, 0.15)'
              : query.text.trim()
                ? 'rgba(255, 215, 0, 0.2)'
                : 'rgba(255, 255, 255, 0.06)',
            color: query.text.trim() ? '#FFD700' : 'rgba(255,255,255,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: query.text.trim() && !query.isProcessing ? 'pointer' : 'default',
            flexShrink: 0,
            transition: 'all 0.2s ease',
          }}
        >
          {query.isProcessing ? (
            <div
              style={{
                width: '14px',
                height: '14px',
                border: '2px solid rgba(255,215,0,0.3)',
                borderTopColor: '#FFD700',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9" />
            </svg>
          )}
        </button>
      </form>

      {/* Response bubble — shows streaming text live, then final response */}
      {(streamingText || query.response) && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.875rem 1rem',
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '12px',
            border: `1px solid rgba(0, 255, 255, ${streamingText ? 0.25 : 0.1})`,
            color: 'rgba(255, 255, 255, 0.85)',
            fontFamily: 'monospace',
            fontSize: '12px',
            lineHeight: 1.6,
            letterSpacing: '0.02em',
            animation: 'fadeInUp 0.3s ease',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          {streamingText || query.response}
          {streamingText && (
            <span
              style={{
                display: 'inline-block',
                width: '6px',
                height: '14px',
                background: '#00FFFF',
                marginLeft: '2px',
                animation: 'blink 0.7s step-end infinite',
                verticalAlign: 'middle',
              }}
            />
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

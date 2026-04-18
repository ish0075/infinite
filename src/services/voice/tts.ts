// ─── Text-to-Speech: ElevenLabs + Browser fallback ───

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = import.meta.env.VITE_ELEVENLABS_VOICE_ID || 'bbGtsRRKUfYO634UxSjz';

export async function synthesizeElevenLabs(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID
): Promise<ArrayBuffer> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API key not configured');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`TTS failed: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

// ─── Browser native TTS fallback ───
export function speakBrowserTTS(text: string, onEnd?: () => void): void {
  if (!window.speechSynthesis) {
    console.warn('[TTS] Browser speech synthesis not available');
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Try to find a good voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) =>
    v.name.includes('Google US English') ||
    v.name.includes('Samantha') ||
    v.name.includes('Daniel')
  );
  if (preferred) utterance.voice = preferred;

  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
}

// ─── Unified TTS: ElevenLabs → Browser fallback ───
export async function speak(text: string, onEnd?: () => void): Promise<void> {
  try {
    if (ELEVENLABS_API_KEY) {
      const audioData = await synthesizeElevenLabs(text);
      const blob = new Blob([audioData], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        onEnd?.();
      };
      await audio.play();
      return;
    }
  } catch (err) {
    console.warn('[TTS] ElevenLabs failed, falling back to browser:', err);
  }

  // Fallback
  speakBrowserTTS(text, onEnd);
}

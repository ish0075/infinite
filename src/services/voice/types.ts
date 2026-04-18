// ─── Voice Service Types: The Speech-to-Thought Pipeline ───

export interface STTResult {
  text: string;
  confidence: number;
  isFinal: boolean;
}

export interface TTSOptions {
  voiceId?: string;
  speed?: number;
  stability?: number;
  clarity?: number;
}

export interface VoicePipelineState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  transcript: string;
  error: string | null;
}

export type VoicePipelineEvent =
  | { type: 'transcript'; text: string }
  | { type: 'thinking' }
  | { type: 'response'; text: string }
  | { type: 'speaking'; audioUrl: string }
  | { type: 'error'; message: string }
  | { type: 'idle' };

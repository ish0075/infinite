// ─── Audio Data Structure: The Pulse of the Universe ───

export interface AudioData {
  /** Raw frequency data from AnalyserNode (0-255) */
  frequency: Uint8Array;
  /** Raw time-domain data (waveform) */
  timeDomain: Uint8Array;
  /** Bass energy (0-1) — 20Hz to ~300Hz. The "voice fundamental" */
  bass: number;
  /** Mid energy (0-1) — ~300Hz to ~2kHz. Speech clarity */
  mid: number;
  /** Treble energy (0-1) — ~2kHz to ~20kHz. Presence and sibilance */
  treble: number;
  /** Overall volume (0-1) */
  volume: number;
  /** Whether the analyzer is actively capturing */
  isActive: boolean;
  /** "Thinking" pulse intensity (0-1) — driven by LLM token stream */
  thinking: number;
  /** Ingestion pulse intensity (0-1) — driven by file upload processing */
  ingestionPulse: number;
}

export interface AudioAnalyzerState {
  audioDataRef: React.RefObject<AudioData | null>;
  isActive: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

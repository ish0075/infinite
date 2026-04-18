/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_GROQ_API_KEY: string;
  readonly VITE_KIMI_API_KEY: string;
  readonly VITE_ELEVENLABS_API_KEY: string;
  readonly VITE_ELEVENLABS_VOICE_ID: string;
  readonly VITE_QDRANT_URL: string;
  readonly VITE_QDRANT_COLLECTION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

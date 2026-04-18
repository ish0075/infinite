// ─── Frontend API Client ───
// Calls our secure serverless endpoints. No API keys exposed.

import type { LLMMessage } from '../llm/types';
import type { RAGResponse } from '../rag/types';

const API_BASE = ''; // Relative to origin (same domain on Vercel)

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ─── LLM ───
export async function queryLLMApi(options: {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  provider?: string;
}) {
  return post<{
    text: string;
    provider: string;
    model: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    cached?: boolean;
  }>('/api/llm', options);
}

// ─── RAG ───
export async function queryRAGApi(options: { text: string; topK?: number }) {
  return post<RAGResponse & { degraded?: boolean }>('/api/rag', options);
}

// ─── TTS ───
export async function synthesizeTTSApi(text: string, voiceId?: string): Promise<ArrayBuffer> {
  const response = await fetch(`${API_BASE}/api/voice/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.arrayBuffer();
}

// ─── Streaming Query (SSE) ───
export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onThinking?: (message: string) => void;
  onError?: (message: string) => void;
  onDone?: (metadata: object) => void;
}

export async function streamCognitiveQuery(
  options: { text: string; provider?: string },
  callbacks: StreamCallbacks
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      try {
        const parsed = JSON.parse(data);
        switch (parsed.type) {
          case 'token':
            callbacks.onToken?.(parsed.content);
            break;
          case 'thinking':
            callbacks.onThinking?.(parsed.message);
            break;
          case 'error':
            callbacks.onError?.(parsed.message);
            break;
          case 'done':
            callbacks.onDone?.(parsed.metadata || {});
            break;
        }
      } catch {
        // Ignore malformed lines
      }
    }
  }
}

// ─── Legacy non-streaming wrapper ───
export async function queryCognitiveApi(options: { text: string; provider?: string }) {
  let fullText = '';
  await streamCognitiveQuery(options, {
    onToken: (t) => { fullText += t; },
    onError: (m) => { throw new Error(m); },
  });
  return {
    text: fullText,
    provider: 'unknown',
    model: 'unknown',
    ragDegraded: false,
    contextChunks: 0,
    latencyMs: 0,
    degraded: false,
  };
}

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

// ─── Combined Query (RAG + LLM) ───
export async function queryCognitiveApi(options: { text: string; provider?: string }) {
  return post<{
    text: string;
    provider: string;
    model: string;
    ragDegraded: boolean;
    contextChunks: number;
    latencyMs: number;
    cached?: boolean;
    degraded?: boolean;
  }>('/api/query', options);
}

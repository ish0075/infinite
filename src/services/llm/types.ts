// ─── LLM Service Types: The Cognitive Engine Contracts ───

export type LLMProvider = 'openai' | 'groq' | 'kimi' | 'ollama';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMQuery {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  provider?: LLMProvider;
}

export interface LLMResponse {
  text: string;
  provider: LLMProvider;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}

export interface LLMRouterConfig {
  defaultProvider: LLMProvider;
  fallbackProvider: LLMProvider;
  routingRules: {
    fastQueries: LLMProvider;      // Chat/status → Groq
    reasoningQueries: LLMProvider; // Complex/RAG → OpenAI/Claude
    privateQueries: LLMProvider;   // Sensitive → Ollama
  };
}

// ─── Route decision based on query characteristics ───
export interface RouteDecision {
  provider: LLMProvider;
  reason: string;
  estimatedLatency: 'instant' | 'fast' | 'standard' | 'slow';
}

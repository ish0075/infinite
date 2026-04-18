import OpenAI from 'openai';
import type { LLMQuery, LLMResponse, LLMProvider, RouteDecision, LLMRouterConfig } from './types';

// ─── Router Configuration ───
const CONFIG: LLMRouterConfig = {
  defaultProvider: 'openai',
  fallbackProvider: 'groq',
  routingRules: {
    fastQueries: 'groq',       // Sub-second: status, greetings, simple facts
    reasoningQueries: 'openai', // Complex: analysis, RAG, multi-step reasoning
    privateQueries: 'ollama',   // Sensitive: local-only, no data leaves machine
  },
};

// ─── Provider Model Mapping ───
const MODELS: Record<LLMProvider, string> = {
  openai: 'gpt-4o-mini',      // Fast, cheap, capable
  groq: 'llama-3.1-8b-instant', // Blazing fast inference
  kimi: 'moonshot-v1-8k',     // Chinese-optimized
  ollama: 'llama3.2',         // Local inference
};

// ─── API Key Resolution ───
function getApiKey(provider: LLMProvider): string | undefined {
  switch (provider) {
    case 'openai':
      return import.meta.env.VITE_OPENAI_API_KEY;
    case 'groq':
      return import.meta.env.VITE_GROQ_API_KEY;
    case 'kimi':
      return import.meta.env.VITE_KIMI_API_KEY;
    case 'ollama':
      return undefined; // Local, no key needed
    default:
      return undefined;
  }
}

function getBaseURL(provider: LLMProvider): string | undefined {
  switch (provider) {
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'kimi':
      return 'https://api.moonshot.cn/v1';
    case 'ollama':
      return 'http://localhost:11434/v1';
    default:
      return undefined;
  }
}

// ─── Route Decision Engine ───
export function decideRoute(query: LLMQuery): RouteDecision {
  const userMessage = query.messages.find((m) => m.role === 'user')?.content || '';
  const lower = userMessage.toLowerCase();

  // Heuristic 1: Simple / greeting / status queries → Fast (Groq)
  const simplePatterns = [
    /^hi\b/, /^hello\b/, /^hey\b/, /^status/,
    /^what\s+is\s+(the\s+)?time/,
    /^how\s+are\s+you/,
    /^help\b/,
  ];
  if (simplePatterns.some((p) => p.test(lower))) {
    return {
      provider: CONFIG.routingRules.fastQueries,
      reason: 'Simple query → fast provider for sub-second response',
      estimatedLatency: 'instant',
    };
  }

  // Heuristic 2: Analysis / reasoning / multi-step → Reasoning (OpenAI)
  const reasoningPatterns = [
    /analyze/, /compare/, /evaluate/, /recommend/,
    /why\s+is/, /how\s+does/, /explain\s+the/,
    /what\s+are\s+the\s+implications/,
    /contract\s+status/, /deal\s+status/,
    /client\s+profile/, /property\s+valuation/,
  ];
  if (reasoningPatterns.some((p) => p.test(lower))) {
    return {
      provider: CONFIG.routingRules.reasoningQueries,
      reason: 'Complex reasoning task → high-capability provider',
      estimatedLatency: 'standard',
    };
  }

  // Heuristic 3: RAG context present → Reasoning
  if (query.messages.some((m) => m.role === 'system' && m.content.includes('CONTEXT'))) {
    return {
      provider: CONFIG.routingRules.reasoningQueries,
      reason: 'RAG-augmented query → reasoning provider for grounded answers',
      estimatedLatency: 'standard',
    };
  }

  // Default: use specified provider or fallback to default
  return {
    provider: query.provider || CONFIG.defaultProvider,
    reason: 'No routing heuristic matched → default provider',
    estimatedLatency: 'fast',
  };
}

// ─── Core LLM Execution ───
export async function queryLLM(rawQuery: LLMQuery): Promise<LLMResponse> {
  const startTime = performance.now();

  // 1. Decide route
  const route = decideRoute(rawQuery);
  const provider = rawQuery.provider || route.provider;

  // 2. Get credentials
  const apiKey = getApiKey(provider);
  const baseURL = getBaseURL(provider);

  if (!apiKey && provider !== 'ollama') {
    throw new Error(`No API key configured for provider: ${provider}`);
  }

  // 3. Build OpenAI-compatible client
  const client = new OpenAI({
    apiKey: apiKey || 'ollama',
    baseURL,
    dangerouslyAllowBrowser: true,
  });

  // 4. Execute
  try {
    const completion = await client.chat.completions.create({
      model: MODELS[provider],
      messages: rawQuery.messages as any,
      temperature: rawQuery.temperature ?? 0.7,
      max_tokens: rawQuery.maxTokens ?? 1024,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    return {
      text: completion.choices[0]?.message?.content || '',
      provider,
      model: MODELS[provider],
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : undefined,
      latencyMs,
    };
  } catch (err) {
    // Fallback to default provider on failure
    if (provider !== CONFIG.fallbackProvider) {
      console.warn(`[LLM Router] ${provider} failed, falling back to ${CONFIG.fallbackProvider}`, err);
      return queryLLM({ ...rawQuery, provider: CONFIG.fallbackProvider });
    }
    throw err;
  }
}

// ─── Streaming variant (for real-time voice pipeline) ───
export async function* streamLLM(rawQuery: LLMQuery): AsyncGenerator<string, LLMResponse, unknown> {
  const startTime = performance.now();
  const route = decideRoute(rawQuery);
  const provider = rawQuery.provider || route.provider;

  const apiKey = getApiKey(provider);
  const baseURL = getBaseURL(provider);

  const client = new OpenAI({
    apiKey: apiKey || 'ollama',
    baseURL,
    dangerouslyAllowBrowser: true,
  });

  const stream = await client.chat.completions.create({
    model: MODELS[provider],
    messages: rawQuery.messages as any,
    temperature: rawQuery.temperature ?? 0.7,
    max_tokens: rawQuery.maxTokens ?? 1024,
    stream: true,
  });

  let fullText = '';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    fullText += delta;
    yield delta;
  }

  return {
    text: fullText,
    provider,
    model: MODELS[provider],
    latencyMs: Math.round(performance.now() - startTime),
  };
}

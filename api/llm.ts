// ─── API: LLM Router (Server-Side, fetch-based) ───

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit, getRateLimitHeaders } from './utils/rateLimit';
import { getCached, setCached } from './utils/cache';

const MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  groq: 'llama-3.1-8b-instant',
  kimi: 'moonshot-v1-8k',
};

const API_KEYS: Record<string, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  groq: process.env.GROQ_API_KEY,
  kimi: process.env.KIMI_API_KEY,
};

const BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  kimi: 'https://api.moonshot.cn/v1',
};

function getClientIP(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return req.socket?.remoteAddress || 'unknown';
}

async function callProvider(
  provider: string,
  messages: any[],
  temperature: number,
  maxTokens: number
): Promise<{ text: string; model: string; usage?: any }> {
  const apiKey = API_KEYS[provider];
  if (!apiKey) throw new Error(`No API key for ${provider}`);

  const url = `${BASE_URLS[provider]}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELS[provider],
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`${provider} API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text: data.choices[0]?.message?.content || '',
    model: MODELS[provider],
    usage: data.usage,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = getClientIP(req);
  const rateLimit = checkRateLimit(ip);
  const headers = getRateLimitHeaders(ip);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (!rateLimit.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded. Please slow down.' });
    return;
  }

  try {
    const { messages, temperature = 0.7, maxTokens = 1024, provider } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array required' });
      return;
    }

    const resolvedProvider = provider || decideProvider(messages);

    // Cache key
    const cacheKey = `llm:${resolvedProvider}:${JSON.stringify(messages)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.status(200).json({ ...cached, cached: true });
      return;
    }

    // Try primary provider
    let result;
    try {
      result = await callProvider(resolvedProvider, messages, temperature, maxTokens);
    } catch (primaryErr) {
      // Fallback to openai
      const fallback = 'openai';
      if (resolvedProvider !== fallback && API_KEYS[fallback]) {
        console.warn(`[LLM] ${resolvedProvider} failed, falling back to ${fallback}`);
        result = await callProvider(fallback, messages, temperature, maxTokens);
      } else {
        throw primaryErr;
      }
    }

    const response = { text: result.text, provider: resolvedProvider, model: result.model, usage: result.usage };
    setCached(cacheKey, response);
    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API /llm]', message);
    res.status(500).json({
      error: 'The Singularity encountered a disturbance.',
      detail: message,
      degraded: true,
      text: 'I apologize, but my cognitive systems are temporarily recalibrating. Please try again in a moment.',
    });
  }
}

function decideProvider(messages: any[]): string {
  const userMsg = messages.find((m) => m.role === 'user')?.content || '';
  const lower = userMsg.toLowerCase();
  const simplePatterns = [/^hi\b/, /^hello\b/, /^hey\b/, /^status/, /^help\b/];
  if (simplePatterns.some((p) => p.test(lower))) return 'groq';
  return 'openai';
}

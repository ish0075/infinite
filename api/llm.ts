// ─── API: LLM Router (Server-Side) ───
// Routes queries to the appropriate provider using secure server-side keys.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit, getRateLimitHeaders } from './utils/rateLimit';
import { getCached, setCached } from './utils/cache';

const MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  groq: 'llama-3.1-8b-instant',
  kimi: 'moonshot-v1-8k',
  ollama: 'llama3.2',
};

const API_KEYS: Record<string, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  groq: process.env.GROQ_API_KEY,
  kimi: process.env.KIMI_API_KEY,
};

const BASE_URLS: Record<string, string | undefined> = {
  groq: 'https://api.groq.com/openai/v1',
  kimi: 'https://api.moonshot.cn/v1',
  ollama: 'http://localhost:11434/v1',
};

function getClientIP(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
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

  // Rate limiting
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

    // Decide provider
    const resolvedProvider = provider || decideProvider(messages);
    const apiKey = API_KEYS[resolvedProvider];
    const baseURL = BASE_URLS[resolvedProvider];

    if (!apiKey && resolvedProvider !== 'ollama') {
      res.status(500).json({ error: `Provider ${resolvedProvider} not configured` });
      return;
    }

    // Cache key: hash of messages + provider
    const cacheKey = `llm:${resolvedProvider}:${JSON.stringify(messages)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.status(200).json({ ...cached, cached: true });
      return;
    }

    // Call provider
    const url = baseURL ? `${baseURL}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODELS[resolvedProvider],
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      // Fallback to default provider
      const fallback = 'openai';
      if (resolvedProvider !== fallback && API_KEYS[fallback]) {
        const fallbackResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEYS[fallback]}`,
          },
          body: JSON.stringify({
            model: MODELS[fallback],
            messages,
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (!fallbackResponse.ok) {
          throw new Error(`LLM failed: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
        }

        const data = await fallbackResponse.json();
        const result = {
          text: data.choices[0]?.message?.content || '',
          provider: fallback,
          model: MODELS[fallback],
          usage: data.usage,
        };
        setCached(cacheKey, result);
        res.status(200).json(result);
        return;
      }

      throw new Error(`LLM failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const result = {
      text: data.choices[0]?.message?.content || '',
      provider: resolvedProvider,
      model: MODELS[resolvedProvider],
      usage: data.usage,
    };

    setCached(cacheKey, result);
    res.status(200).json(result);
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

  const reasoningPatterns = [/analyze/, /compare/, /evaluate/, /recommend/, /why\s+is/, /how\s+does/];
  if (reasoningPatterns.some((p) => p.test(lower))) return 'openai';

  return 'openai';
}

// ─── API: LLM Router (Self-Contained) ───
// No external imports — everything inlined for Vercel bundler compatibility.

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Inlined Rate Limiting ───
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + RATE_WINDOW_MS;
    rateLimitMap.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetAt };
  }
  if (entry.count >= RATE_LIMIT) return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT - entry.count, resetAt: entry.resetAt };
}

function getRateLimitHeaders(ip: string) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  const resetAt = entry?.resetAt ?? now + RATE_WINDOW_MS;
  const remaining = entry ? Math.max(0, RATE_LIMIT - entry.count) : RATE_LIMIT;
  return {
    'X-RateLimit-Limit': String(RATE_LIMIT),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  };
}

// ─── Inlined Cache ───
const cache = new Map<string, { value: any; expiresAt: number }>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.value;
}

function setCached<T>(key: string, value: T, ttlMs: number = CACHE_TTL_MS): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ─── LLM Logic ───
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

async function callProvider(provider: string, messages: any[], temperature: number, maxTokens: number) {
  const apiKey = API_KEYS[provider];
  if (!apiKey) throw new Error(`No API key for ${provider}`);

  const response = await fetch(`${BASE_URLS[provider]}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODELS[provider], messages, temperature, max_tokens: maxTokens }),
  });

  if (!response.ok) throw new Error(`${provider} API error: ${response.status}`);

  const data = await response.json();
  return { text: data.choices[0]?.message?.content || '', model: MODELS[provider], usage: data.usage };
}

function decideProvider(messages: any[]): string {
  const userMsg = messages.find((m: any) => m.role === 'user')?.content || '';
  const lower = userMsg.toLowerCase();
  const simplePatterns = [/^hi\b/, /^hello\b/, /^hey\b/, /^status/, /^help\b/];
  if (simplePatterns.some((p) => p.test(lower))) return 'groq';
  return 'openai';
}

// ─── Handler ───
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const ip = getClientIP(req);
  const rateLimit = checkRateLimit(ip);
  Object.entries(getRateLimitHeaders(ip)).forEach(([k, v]) => res.setHeader(k, v));
  if (!rateLimit.allowed) { res.status(429).json({ error: 'Rate limit exceeded' }); return; }

  try {
    const { messages, temperature = 0.7, maxTokens = 1024, provider } = req.body;
    if (!messages || !Array.isArray(messages)) { res.status(400).json({ error: 'Messages array required' }); return; }

    const resolvedProvider = provider || decideProvider(messages);
    const cacheKey = `llm:${resolvedProvider}:${JSON.stringify(messages)}`;
    const cached = getCached(cacheKey);
    if (cached) { res.status(200).json({ ...cached, cached: true }); return; }

    let result;
    try {
      result = await callProvider(resolvedProvider, messages, temperature, maxTokens);
    } catch (primaryErr) {
      const fallback = 'openai';
      if (resolvedProvider !== fallback && API_KEYS[fallback]) {
        console.warn(`[LLM] ${resolvedProvider} failed, falling back to ${fallback}`);
        result = await callProvider(fallback, messages, temperature, maxTokens);
      } else { throw primaryErr; }
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

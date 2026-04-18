// ─── API: Combined Query (RAG + LLM, Self-Contained) ───

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Inlined Rate Limiting ───
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= RATE_LIMIT) return { allowed: false };
  entry.count++;
  return { allowed: true };
}

function getRateLimitHeaders(ip: string) {
  const entry = rateLimitMap.get(ip);
  const remaining = entry ? Math.max(0, RATE_LIMIT - entry.count) : RATE_LIMIT;
  return { 'X-RateLimit-Limit': String(RATE_LIMIT), 'X-RateLimit-Remaining': String(remaining) };
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

// ─── Config ───
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'obsidian_vault';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

function getClientIP(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const ip = getClientIP(req);
  if (!checkRateLimit(ip).allowed) { res.status(429).json({ error: 'Rate limit exceeded' }); return; }
  Object.entries(getRateLimitHeaders(ip)).forEach(([k, v]) => res.setHeader(k, v));

  const startTime = Date.now();

  try {
    const { text, provider } = req.body;
    if (!text) { res.status(400).json({ error: 'Query text required' }); return; }

    const cacheKey = `query:${text}`;
    const cached = getCached(cacheKey);
    if (cached) { res.status(200).json({ ...cached, cached: true, latencyMs: Date.now() - startTime }); return; }

    // ─── Step 1: RAG ───
    let chunks: any[] = [];
    let ragDegraded = false;

    if (OPENAI_KEY) {
      try {
        const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
          body: JSON.stringify({ input: text, model: 'text-embedding-3-small' }),
        });

        if (embedRes.ok) {
          const embedData = await embedRes.json();
          const vector = embedData.data[0].embedding;
          const qdrantRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vector, limit: 5, with_payload: true, with_vector: false, score_threshold: 0.7 }),
          });
          if (qdrantRes.ok) {
            const data = await qdrantRes.json();
            chunks = data.result.map((point: any) => ({
              id: point.id,
              content: point.payload?.content || '',
              metadata: { filePath: point.payload?.file_path || '', title: point.payload?.title || 'Untitled', tags: point.payload?.tags || [] },
              score: point.score,
            }));
          } else { ragDegraded = true; }
        } else { ragDegraded = true; }
      } catch { ragDegraded = true; }
    } else { ragDegraded = true; }

    // ─── Step 2: Build prompt ───
    let systemPrompt = 'You are I.N.F.I.N.I.T.E., the intelligence core of the BigDataClaw ecosystem. You assist with real estate data, client profiles, legal precedents, and deal analysis.';
    if (chunks.length > 0) {
      const ctx = chunks.map((c, i) => `[${i + 1}] ${c.metadata.title}\n${c.content}`).join('\n\n');
      systemPrompt += ` Base your answer on these vault documents:\n\n${ctx}`;
    } else if (ragDegraded) {
      systemPrompt += ' The vault is currently offline. Answer from general knowledge, noting the limitation.';
    }

    // ─── Step 3: LLM ───
    const resolvedProvider = provider || 'openai';
    const apiKey = resolvedProvider === 'groq' ? GROQ_KEY : OPENAI_KEY;
    const baseURL = resolvedProvider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
    const model = resolvedProvider === 'groq' ? 'llama-3.1-8b-instant' : 'gpt-4o-mini';

    if (!apiKey) {
      res.status(500).json({ error: 'No LLM provider configured' });
      return;
    }

    const llmRes = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!llmRes.ok) throw new Error(`LLM error: ${llmRes.status}`);

    const data = await llmRes.json();
    const result = {
      text: data.choices[0]?.message?.content || '',
      provider: resolvedProvider,
      model,
      ragDegraded,
      contextChunks: chunks.length,
      latencyMs: Date.now() - startTime,
    };

    setCached(cacheKey, result);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API /query]', message);
    res.status(500).json({
      error: 'Cognitive systems recalibrating.',
      detail: message,
      degraded: true,
      text: 'I apologize, but I am temporarily unable to process your query. My systems are recalibrating. Please try again shortly.',
      latencyMs: Date.now() - startTime,
    });
  }
}

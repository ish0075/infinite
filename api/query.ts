// ─── API: Combined Query with SSE Streaming (Self-Contained) ───
// Streams LLM tokens directly to the client via Server-Sent Events.
// RAG happens first (fast), then the token stream begins.

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

function sendSSE(res: VercelResponse, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Attempt flush for immediate delivery
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }
}

// ─── Handler: Synchronous entry, async streaming via IIFE ───
export default function handler(req: VercelRequest, res: VercelResponse) {
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
  if (!checkRateLimit(ip).allowed) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }
  Object.entries(getRateLimitHeaders(ip)).forEach(([k, v]) => res.setHeader(k, v));

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.status(200);

  // Fire-and-forget the streaming work
  (async () => {
    try {
      const { text, provider } = req.body;
      if (!text) {
        sendSSE(res, { type: 'error', message: 'Query text required' });
        res.end();
        return;
      }

      // ─── Step 1: RAG (pre-stream, fast) ───
      sendSSE(res, { type: 'thinking', message: 'Retrieving knowledge...' });

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
            const qdrantRes = await fetch(
              `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vector, limit: 5, with_payload: true, with_vector: false, score_threshold: 0.7 }),
              }
            );
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

      // ─── Step 3: Stream LLM ───
      const resolvedProvider = provider || 'openai';
      const apiKey = resolvedProvider === 'groq' ? GROQ_KEY : OPENAI_KEY;
      const baseURL = resolvedProvider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
      const model = resolvedProvider === 'groq' ? 'llama-3.1-8b-instant' : 'gpt-4o-mini';

      if (!apiKey) {
        sendSSE(res, { type: 'error', message: 'No LLM provider configured' });
        res.end();
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
          stream: true,
        }),
      });

      if (!llmRes.ok) {
        sendSSE(res, { type: 'error', message: `LLM error: ${llmRes.status}` });
        res.end();
        return;
      }

      // Read the stream
      const reader = llmRes.body?.getReader();
      if (!reader) {
        sendSSE(res, { type: 'error', message: 'No response stream' });
        res.end();
        return;
      }

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
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content || '';
            if (token) {
              sendSSE(res, { type: 'token', content: token });
            }
          } catch {
            // Ignore malformed JSON lines
          }
        }
      }

      // ─── Step 4: Done ───
      sendSSE(res, { type: 'done', metadata: { provider: resolvedProvider, model, ragDegraded, contextChunks: chunks.length } });
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[API /query]', message);
      try {
        sendSSE(res, { type: 'error', message });
        res.end();
      } catch {
        // Response may already be closed
      }
    }
  })();

  // Return void — Vercel won't wait for the async IIFE
}

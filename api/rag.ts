// ─── API: RAG Bridge (Server-Side, fetch-based) ───

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit, getRateLimitHeaders } from './_rateLimit';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'obsidian_vault';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

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
  const rateLimit = checkRateLimit(ip);
  Object.entries(getRateLimitHeaders(ip)).forEach(([k, v]) => res.setHeader(k, v));
  if (!rateLimit.allowed) { res.status(429).json({ error: 'Rate limit exceeded' }); return; }

  try {
    const { text, topK = 5 } = req.body;
    if (!text) { res.status(400).json({ error: 'Query text required' }); return; }

    if (!OPENAI_KEY) {
      res.status(200).json({ chunks: [], query: text, degraded: true, error: 'Embedding service not configured' });
      return;
    }

    // Embed query
    const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ input: text, model: 'text-embedding-3-small' }),
    });

    if (!embedRes.ok) {
      res.status(200).json({ chunks: [], query: text, degraded: true });
      return;
    }

    const embedData = await embedRes.json();
    const vector = embedData.data[0].embedding;

    // Query Qdrant
    const qdrantRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, limit: topK, with_payload: true, with_vector: false, score_threshold: 0.7 }),
    });

    if (!qdrantRes.ok) {
      res.status(200).json({ chunks: [], query: text, degraded: true });
      return;
    }

    const data = await qdrantRes.json();
    const chunks = data.result.map((point: any) => ({
      id: point.id,
      content: point.payload?.content || '',
      metadata: {
        filePath: point.payload?.file_path || '',
        title: point.payload?.title || 'Untitled',
        tags: point.payload?.tags || [],
        createdAt: point.payload?.created_at || '',
        chunkIndex: point.payload?.chunk_index || 0,
      },
      score: point.score,
    }));

    res.status(200).json({ chunks, query: text });
  } catch (err) {
    console.error('[API /rag]', err);
    res.status(200).json({ chunks: [], query: req.body?.text || '', degraded: true });
  }
}

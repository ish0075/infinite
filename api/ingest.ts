// ─── API: Ingestion Engine (Self-Contained) ───
// Receives pre-chunked text + metadata from the client.
// Embeds chunks via OpenAI, upserts vectors + payload into Qdrant.
// Max 50 chunks per call (Vercel 10s timeout safety).

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Config ───
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'obsidian_vault';
const MAX_CHUNKS = 50;

// ─── Simple hash for deterministic IDs ───
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

function chunkId(content: string, index: number, timestamp: number): number {
  return djb2(`${content}:${index}:${timestamp}`);
}

// ─── Embed multiple chunks in one OpenAI call ───
async function embedChunks(chunks: string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      input: chunks,
      model: 'text-embedding-3-small',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Embedding failed: ${response.status}`);
  }

  const data = await response.json();
  return data.data.map((d: any) => d.embedding);
}

// ─── Upsert points into Qdrant ───
async function upsertToQdrant(points: { id: number; vector: number[]; payload: object }[]): Promise<void> {
  const response = await fetch(
    `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points?wait=true`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.status?.error || `Qdrant upsert failed: ${response.status}`);
  }
}

// ─── Handler ───
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

  if (!OPENAI_KEY) {
    res.status(503).json({ error: 'OpenAI API key not configured' });
    return;
  }

  try {
    const { chunks, metadata } = req.body;

    if (!Array.isArray(chunks) || chunks.length === 0) {
      res.status(400).json({ error: 'chunks array required' });
      return;
    }

    if (chunks.length > MAX_CHUNKS) {
      res.status(400).json({ error: `Max ${MAX_CHUNKS} chunks per request. Split into batches.` });
      return;
    }

    const ts = Date.now();

    // 1. Embed all chunks in one batched call
    const embeddings = await embedChunks(chunks);

    // 2. Build Qdrant points
    const points = chunks.map((content: string, idx: number) => ({
      id: chunkId(content, idx, ts),
      vector: embeddings[idx],
      payload: {
        content: content.slice(0, 8000), // Safety cap
        title: metadata?.title || 'Untitled',
        file_path: metadata?.source || 'ingestion',
        tags: metadata?.tags || [],
        chunk_index: idx,
        total_chunks: chunks.length,
        ingested_at: new Date().toISOString(),
      },
    }));

    // 3. Upsert to Qdrant
    await upsertToQdrant(points);

    res.status(200).json({
      success: true,
      inserted: points.length,
      metadata: {
        title: metadata?.title,
        source: metadata?.source,
        chunks: chunks.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    console.error('[API /ingest]', message);
    res.status(500).json({ error: message });
  }
}

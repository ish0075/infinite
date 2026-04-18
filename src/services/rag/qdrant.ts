import type { RAGQuery, RAGResponse, RAGChunk, AugmentedPrompt } from './types';

// ─── Qdrant Configuration ───
const QDRANT_URL = import.meta.env.VITE_QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = import.meta.env.VITE_QDRANT_COLLECTION || 'obsidian_vault';

// ─── Embedding via OpenAI (client-side for demo) ───
// In production, this should be server-side to protect API keys
async function embedQuery(text: string): Promise<number[]> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key required for embeddings');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-small',
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// ─── Query Qdrant for similar chunks ───
export async function queryRAG(rawQuery: RAGQuery): Promise<RAGResponse> {
  const startTime = performance.now();

  try {
    // 1. Embed the query
    const vector = await embedQuery(rawQuery.text);

    // 2. Query Qdrant
    const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector,
        limit: rawQuery.topK ?? 5,
        with_payload: true,
        with_vector: false,
        score_threshold: 0.7, // Only semantically relevant results
      }),
    });

    if (!response.ok) {
      throw new Error(`Qdrant query failed: ${response.status}`);
    }

    const data = await response.json();

    const chunks: RAGChunk[] = data.result.map((point: any) => ({
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

    return {
      chunks,
      query: rawQuery.text,
      latencyMs: Math.round(performance.now() - startTime),
    };
  } catch (err) {
    console.warn('[RAG] Qdrant unavailable, returning empty context:', err);
    // Graceful degradation: return empty context
    return {
      chunks: [],
      query: rawQuery.text,
      latencyMs: Math.round(performance.now() - startTime),
    };
  }
}

// ─── Build augmented prompt with RAG context ───
export function buildAugmentedPrompt(query: string, ragResult: RAGResponse): AugmentedPrompt {
  const { chunks } = ragResult;

  if (chunks.length === 0) {
    return {
      systemPrompt:
        'You are I.N.F.I.N.I.T.E., the intelligence core of the BigDataClaw ecosystem. ' +
        'You assist with real estate data, client profiles, legal precedents, and deal analysis. ' +
        'You have access to the user\'s Obsidian vault but no relevant documents were retrieved for this query. ' +
        'Answer to the best of your general knowledge.',
      userPrompt: query,
      contextChunks: [],
      totalContextTokens: 0,
    };
  }

  // Build context block from retrieved chunks
  const contextBlock = chunks
    .map((chunk, i) => {
      const meta = chunk.metadata;
      return `[Document ${i + 1}] ${meta.title}\n` +
        `Source: ${meta.filePath}\n` +
        `Tags: ${meta.tags.join(', ') || 'none'}\n` +
        `Relevance: ${(chunk.score * 100).toFixed(1)}%\n` +
        `---\n${chunk.content}\n`;
    })
    .join('\n');

  const systemPrompt =
    'You are I.N.F.I.N.I.T.E., the intelligence core of the BigDataClaw ecosystem. ' +
    'You have access to the user\'s Obsidian vault via Retrieval-Augmented Generation (RAG). ' +
    'The following documents were retrieved as relevant context. ' +
    'Base your answer primarily on these documents. Cite sources when possible. ' +
    'If the context does not contain the answer, say so clearly.\n\n' +
    '=== RETRIEVED CONTEXT ===\n' +
    contextBlock;

  // Rough token estimate (4 chars ≈ 1 token)
  const totalContextTokens = Math.round(systemPrompt.length / 4);

  return {
    systemPrompt,
    userPrompt: query,
    contextChunks: chunks,
    totalContextTokens,
  };
}

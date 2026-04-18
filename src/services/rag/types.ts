// ─── RAG Service Types: The Memory Link ───

export interface RAGChunk {
  id: string;
  content: string;
  metadata: {
    filePath: string;
    title: string;
    tags: string[];
    createdAt: string;
    chunkIndex: number;
  };
  score: number; // Cosine similarity score
}

export interface RAGQuery {
  text: string;
  topK?: number;
  filter?: {
    tags?: string[];
    filePaths?: string[];
    dateRange?: { from: string; to: string };
  };
}

export interface RAGResponse {
  chunks: RAGChunk[];
  query: string;
  latencyMs: number;
}

export interface AugmentedPrompt {
  systemPrompt: string;
  userPrompt: string;
  contextChunks: RAGChunk[];
  totalContextTokens: number;
}

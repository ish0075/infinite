// ─── Ingestion API Client ───
// Uploads chunked text to the serverless ingest endpoint.

const API_BASE = '';

export interface IngestPayload {
  chunks: string[];
  metadata: {
    title: string;
    source: string;
    tags?: string[];
  };
}

export interface IngestResult {
  success: boolean;
  inserted: number;
  metadata: {
    title: string;
    source: string;
    chunks: number;
  };
}

export async function ingestChunks(payload: IngestPayload): Promise<IngestResult> {
  const response = await fetch(`${API_BASE}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Ingest failed: ${response.status}`);
  }

  return response.json();
}

// ─── Text Chunking Engine: Chaos → Order ───
// Client-side chunker. No dependencies. Handles overlap and semantic boundaries.

export interface ChunkOptions {
  chunkSize?: number;   // Target characters per chunk
  overlap?: number;     // Characters of overlap between chunks
  separator?: string;   // Preferred split boundary
}

const DEFAULTS: Required<ChunkOptions> = {
  chunkSize: 1000,
  overlap: 200,
  separator: '\n\n',
};

/**
 * Split text into overlapping chunks, respecting paragraph boundaries where possible.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { chunkSize, overlap, separator } = { ...DEFAULTS, ...options };
  const chunks: string[] = [];

  if (text.length <= chunkSize) {
    return [text.trim()];
  }

  // Split on preferred separator first
  const segments = text.split(separator).filter((s) => s.trim().length > 0);

  let currentChunk = '';

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    // If adding this segment stays within chunkSize, append it
    if (currentChunk.length + trimmed.length + 2 <= chunkSize) {
      currentChunk += (currentChunk ? separator : '') + trimmed;
      continue;
    }

    // Current chunk is full — push it
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    // If the segment itself is larger than chunkSize, hard-split it
    if (trimmed.length > chunkSize) {
      const subChunks = hardSplit(trimmed, chunkSize, overlap);
      // All but the last sub-chunk get pushed; the last becomes currentChunk
      for (let i = 0; i < subChunks.length - 1; i++) {
        chunks.push(subChunks[i]);
      }
      currentChunk = subChunks[subChunks.length - 1];
    } else {
      currentChunk = trimmed;
    }
  }

  // Push the final chunk
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Hard-split text into fixed-size chunks with overlap.
 * Used as fallback when segments are too large.
 */
function hardSplit(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    start += chunkSize - overlap;
    if (start >= end) break; // Safety: prevent infinite loop
  }

  return chunks;
}

/**
 * Parse CSV into text chunks (each row becomes a structured text block).
 */
export function chunkCSV(csvText: string, options: ChunkOptions = {}): string[] {
  const lines = csvText.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return chunkText(csvText, options);

  const headers = lines[0].split(',').map((h) => h.trim());
  const chunks: string[] = [];
  let currentBlock = '';
  const { chunkSize } = { ...DEFAULTS, ...options };

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim());
    const rowText = headers.map((h, idx) => `${h}: ${cells[idx] || ''}`).join('\n');

    if (currentBlock.length + rowText.length + 2 > chunkSize && currentBlock) {
      chunks.push(currentBlock.trim());
      currentBlock = rowText;
    } else {
      currentBlock += (currentBlock ? '\n---\n' : '') + rowText;
    }
  }

  if (currentBlock) chunks.push(currentBlock.trim());
  return chunks;
}

/**
 * Detect file type and route to appropriate chunker.
 */
export function autoChunk(text: string, fileName: string, options?: ChunkOptions): string[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return chunkCSV(text, options);
  return chunkText(text, options);
}

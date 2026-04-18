// ─── Simple LRU Cache for Serverless ───

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const MAX_SIZE = 100;

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

export function setCached<T>(key: string, value: T, ttlMs: number = 5 * 60 * 1000): void {
  // Evict oldest if at capacity (simple FIFO)
  if (cache.size >= MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }

  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

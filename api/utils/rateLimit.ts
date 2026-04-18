// ─── Rate Limiting: The Cognitive Guard ───

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// 10 requests per minute per IP
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    // New window
    const resetAt = now + RATE_WINDOW_MS;
    rateLimitMap.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetAt };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT - entry.count, resetAt: entry.resetAt };
}

export function getRateLimitHeaders(ip: string): Record<string, string> {
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

// Shared Rate Limiter for Edge Functions
// In-memory implementation using a Map. Each isolate has its own counter,
// which resets on cold starts. This is a best-effort limiter suitable for
// reducing abuse — not a hard guarantee across distributed instances.
const store = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  limit: number = 100,
  windowMs: number = 60000
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    // New window
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  entry.count++;
  const allowed = entry.count <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
  };
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
    'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000).toString(),
  };
}

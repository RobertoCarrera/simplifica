// Shared Rate Limiter for Edge Functions
// Persistent implementation using Deno KV — survives cold starts and is shared
// across all parallel Edge Function instances, preventing bypass via instance
// proliferation (unlike in-memory Maps which reset per isolate).

let _kv: Deno.Kv | null = null;
async function getKv(): Promise<Deno.Kv> {
  if (!_kv) _kv = await Deno.openKv();
  return _kv;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

// Uses fixed time windows (aligned to wall clock) for predictable resets.
// Atomic CAS loop (max 3 retries) ensures correctness under concurrent requests.
export async function checkRateLimit(
  ip: string,
  limit: number = 100,
  windowMs: number = 60000
): Promise<RateLimitResult> {
  const kv = await getKv();
  const now = Date.now();
  const windowId = Math.floor(now / windowMs);
  const resetAt = (windowId + 1) * windowMs;
  const key = ["rl", ip, windowId];

  let count = 1;
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await kv.get<number>(key);
    count = (existing.value ?? 0) + 1;
    const res = await kv.atomic()
      .check(existing)
      .set(key, count, { expireIn: windowMs * 2 })
      .commit();
    if (res.ok) break;
  }

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
    'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000).toString(),
}

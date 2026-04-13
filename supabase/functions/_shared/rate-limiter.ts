/**
 * Shared Rate Limiter for Edge Functions — Hybrid Redis + In-Memory Strategy
 *
 * SECURITY VECTORS REMEDIATION — Phase 1
 * Requirements: SEC-RATE-01, SEC-RATE-02, SEC-RATE-03, SEC-RATE-04, SEC-RATE-05
 *
 * ## Architecture: Redis primary, in-memory fallback (fail-open)
 *
 * PRIMARY — Upstash Redis via @upstash/redis SDK:
 *   - Persistent and shared across ALL distributed Edge Function isolates.
 *   - Survives cold starts: a counter incremented in isolate A is visible to B.
 *   - Fixed-window algorithm: simple, low Redis ops (1 INCR + 1 EXPIRE per check).
 *   - Configured via UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN env vars.
 *
 * FALLBACK — In-memory Map:
 *   - Activated automatically when Redis env vars are missing OR on Redis error.
 *   - Emits a WARN log so the team knows the stronger guarantee is degraded.
 *   - Resets on cold starts — NOT distributed. Best-effort protection only.
 *   - In local dev, this is the expected path (no Redis instance needed).
 *
 * ## Why fail-open (not fail-closed)?
 *
 * Fail-closed would block ALL requests when Redis is unavailable — effectively
 * creating a self-inflicted DoS if Redis goes down. Auth endpoints must remain
 * available even during infrastructure degradation. The accepted trade-off:
 * during a Redis outage, burst limits are not enforced across instances. A
 * monitoring alert on the WARN log line triggers investigation within minutes.
 * Contrast with jwt-hook-validator.ts which is fail-closed because the
 * risk profile is different (unauthenticated impersonation vs availability).
 *
 * ## Fixed-window vs sliding-window
 *
 * Fixed-window uses 1 Redis INCR + 1 EXPIRE per request (2 ops, pipelined to
 * 1 round-trip). Sliding-window uses a sorted set (2-3 ops + TTL management).
 * Fixed-window is chosen for auth endpoint protection because the minor burst
 * risk at window boundaries is acceptable, and lower Redis ops = lower cost
 * and latency. Can be upgraded to sliding-window by changing _checkRedis only.
 *
 * ## Key prefixing to avoid collisions
 *
 * Keys follow the pattern `rl:<caller-supplied-key>:<window-bucket>`.
 * Callers MUST include a function-specific prefix in their key, for example:
 *   - `login:${ip}` → produces `rl:login:<ip>:<bucket>`
 *   - `invite:${userId}` → produces `rl:invite:<userId>:<bucket>`
 * Without the prefix, two different functions using the same IP as key would
 * share a counter and interfere with each other's limits.
 *
 * ## Environment variable configuration
 *
 *   UPSTASH_REDIS_URL   — Upstash REST URL (https://....upstash.io)
 *   UPSTASH_REDIS_TOKEN — Upstash REST token
 *
 * Leave both empty in local dev to auto-activate the in-memory fallback.
 * Set via: `supabase secrets set UPSTASH_REDIS_URL=... UPSTASH_REDIS_TOKEN=...`
 *
 * ## Secret rotation (UPSTASH_REDIS_TOKEN)
 *
 *   supabase secrets set UPSTASH_REDIS_TOKEN=<new-token>
 *
 * The Redis client is lazy-initialized once per isolate lifetime. After rotating
 * the token, the new value takes effect on the next cold start of each isolate.
 * Existing warm isolates continue using the old token until they are recycled
 * (typically within minutes under normal load). If immediate rotation is needed,
 * trigger a function redeploy: `supabase functions deploy <function-name>`.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  /** Whether the request is within the rate limit. */
  allowed: boolean;
  /** Total allowed requests per window. */
  limit: number;
  /** Remaining requests in the current window. */
  remaining: number;
  /** UNIX timestamp (ms) when the current window resets. */
  resetAt: number;
}

// ── In-memory fallback store ──────────────────────────────────────────────────

/** Fallback in-memory store. Resets on cold starts. */
const _memoryStore = new Map<string, { count: number; resetAt: number }>();

// ── Redis client (lazy init) ──────────────────────────────────────────────────

type UpstashRedisClient = {
  pipeline: () => UpstashRedisPipeline;
};

type UpstashRedisPipeline = {
  incr: (key: string) => UpstashRedisPipeline;
  expire: (key: string, seconds: number) => UpstashRedisPipeline;
  exec: () => Promise<[number | null, number | null][]>;
};

let _redis: UpstashRedisClient | null = null;
let _redisInitialized = false;

/**
 * Lazy-initialize the Upstash Redis client.
 * Returns null if env vars are missing or the import fails.
 */
async function getRedisClient(): Promise<UpstashRedisClient | null> {
  if (_redisInitialized) return _redis;
  _redisInitialized = true;

  // Support both naming conventions:
  // - UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN (standard)
  // - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (Upstash REST API naming, used in prod)
  const url = Deno.env.get('UPSTASH_REDIS_URL') ?? Deno.env.get('UPSTASH_REDIS_REST_URL') ?? '';
  const token =
    Deno.env.get('UPSTASH_REDIS_TOKEN') ?? Deno.env.get('UPSTASH_REDIS_REST_TOKEN') ?? '';

  if (!url || !token) {
    console.warn(
      '[rate-limiter] UPSTASH_REDIS_URL/UPSTASH_REDIS_REST_URL or ' +
        'UPSTASH_REDIS_TOKEN/UPSTASH_REDIS_REST_TOKEN not set. ' +
        'Using in-memory fallback (not distributed — resets on cold starts).',
    );
    return null;
  }

  try {
    // Dynamic import keeps this file loadable in local dev without the SDK
    const { Redis } = await import('https://esm.sh/@upstash/redis@1.34.3');
    _redis = new Redis({ url, token }) as unknown as UpstashRedisClient;
    console.log('[rate-limiter] Upstash Redis client initialized');
    return _redis;
  } catch (err) {
    console.warn('[rate-limiter] Failed to initialize Upstash Redis client:', err);
    console.warn('[rate-limiter] Falling back to in-memory rate limiting.');
    return null;
  }
}

// ── In-memory rate limiter (fallback) ─────────────────────────────────────────

function _checkMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = _memoryStore.get(key);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    _memoryStore.set(key, { count: 1, resetAt });
    console.warn(`[rate-limiter] In-memory fallback active for key="${key}" — rate limit NOT enforced across instances.`);
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  entry.count++;
  const allowed = entry.count <= limit;
  console.warn(`[rate-limiter] In-memory fallback in use for key="${key}" — distributed burst protection disabled.`);
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
  };
}

// ── Redis rate limiter (primary) ──────────────────────────────────────────────

/**
 * Check rate limit using Upstash Redis with fixed-window strategy.
 * Uses a pipeline to atomically INCR + EXPIRE in a single round-trip.
 *
 * ## Fixed-window implementation details
 *
 * The Redis key includes a wall-clock window bucket: `rl:<key>:<bucket>`.
 * `bucket = Math.floor(Date.now() / windowMs)` — all requests within the
 * same calendar-aligned window share the same key. When the window ends, the
 * bucket number increments and a fresh key is used (old one expires via TTL).
 *
 * Example for windowMs=60000 (1 minute):
 *   At 12:00:00 → bucket = floor(1234560000 / 60000) = 20576000
 *   At 12:00:59 → same bucket 20576000 → same counter
 *   At 12:01:00 → bucket = 20576001 → new counter starts at 0
 *
 * This means requests at 12:00:59 + 12:01:00 can together exceed the per-minute
 * limit (the well-known fixed-window "edge burst" problem). For auth endpoint
 * protection this is an acceptable trade-off vs the complexity of sliding window.
 *
 * ## Fail-open on Redis pipeline error
 *
 * If the pipeline throws (network error, timeout, auth failure), we log a WARN
 * and fall back to the in-memory implementation for THIS request. The next
 * request will retry Redis (no circuit breaker — Upstash errors are rare).
 */
async function _checkRedis(
  redis: UpstashRedisClient,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowSecs = Math.ceil(windowMs / 1000);
  // Align window to wall-clock boundary (e.g., "every full minute")
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  // Key format: rl:<caller-key>:<window-bucket>
  // The bucket number changes every windowMs ms — old keys auto-expire via TTL
  const redisKey = `rl:${key}:${Math.floor(now / windowMs)}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.expire(redisKey, windowSecs + 1); // +1 to avoid races at boundary
    const results = await pipeline.exec();

    const count = (results[0] as unknown as number) ?? 1;
    const allowed = count <= limit;

    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch (err) {
    console.warn('[rate-limiter] Redis pipeline failed — falling back to in-memory (burst protection degraded):', err);
    return _checkMemory(key, limit, windowMs);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check rate limit for a given key.
 *
 * BREAKING CHANGE (Phase 1): This function is now ASYNC due to Redis I/O.
 * All callers MUST use `await checkRateLimit(...)`.
 *
 * @param key       Unique identifier — use `"functionName:${ip}"` or `"functionName:${userId}"`.
 *                  Always include a function-specific prefix to avoid key collisions across functions.
 * @param limit     Max requests allowed per window (default: 100)
 * @param windowMs  Window size in milliseconds (default: 60000 = 1 minute)
 *
 * @example
 * // IP-based limiting for a login endpoint
 * const rl = await checkRateLimit(`login:${ip}`, 10, 60000);
 * if (!rl.allowed) return new Response('Too Many Requests', { status: 429 });
 *
 * @example
 * // User-based limiting for an invite endpoint
 * const rl = await checkRateLimit(`invite:${userId}`, 5, 60000);
 */
export async function checkRateLimit(
  key: string,
  limit: number = 100,
  windowMs: number = 60000,
): Promise<RateLimitResult> {
  const redis = await getRedisClient();

  if (redis) {
    // Redis available: distributed, persistent, survives cold starts
    return _checkRedis(redis, key, limit, windowMs);
  }

  // Fallback: in-memory (not distributed, resets on cold starts).
  // This path is intentionally FAIL-OPEN — we allow the request and rely on
  // the WARN log from getRedisClient() to alert the team that the stronger
  // guarantee is degraded. Do not change this to fail-closed without reviewing
  // the availability impact on auth endpoints.
  return _checkMemory(key, limit, windowMs);
}

// ── Header helpers ────────────────────────────────────────────────────────────

/**
 * Build standard rate-limit response headers from a RateLimitResult.
 *
 * SEC-RATE-03: Returns X-RateLimit-Limit, X-RateLimit-Remaining,
 *              X-RateLimit-Reset, and Retry-After headers.
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    // SEC-RATE-03: ISO format for human readability; also include UNIX for machine use
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
    // SEC-RATE-04: Retry-After in seconds (as per RFC 6585)
    'Retry-After': Math.ceil(Math.max(0, result.resetAt - Date.now()) / 1000).toString(),
  };
}

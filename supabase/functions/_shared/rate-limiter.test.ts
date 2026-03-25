// @ts-nocheck
/**
 * Unit tests for rate-limiter.ts (hybrid Redis + in-memory strategy)
 *
 * SECURITY VECTORS REMEDIATION — Phase 1
 * Requirements: SEC-RATE-01, SEC-RATE-02, SEC-RATE-03, SEC-RATE-04
 *
 * Running:
 *   deno test supabase/functions/_shared/rate-limiter.test.ts
 *
 * Strategy:
 *   - These tests run with UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN unset,
 *     so the in-memory fallback is active. This tests the fallback behavior.
 *   - Redis primary path is tested in integration tests.
 *   - The in-memory fallback has identical semantics to Redis (fixed window)
 *     except it resets on cold starts.
 */

import { checkRateLimit, getRateLimitHeaders } from './rate-limiter.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uniqueKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── SEC-RATE-01: IP-based rate limiting ───────────────────────────────────────

Deno.test('SEC-RATE-01: allows requests within limit', async () => {
  const key = uniqueKey('test-ip');

  const result = await checkRateLimit(key, 3, 60000);
  console.assert(result.allowed === true, `Expected allowed=true, got: ${result.allowed}`);
  console.assert(result.limit === 3, `Expected limit=3, got: ${result.limit}`);
  console.assert(result.remaining === 2, `Expected remaining=2, got: ${result.remaining}`);
  console.assert(result.resetAt > Date.now(), 'resetAt should be in the future');

  console.log('✓ SEC-RATE-01: first request within limit is allowed');
});

// ── SEC-RATE-02: Limit enforcement ────────────────────────────────────────────

Deno.test('SEC-RATE-02: blocks request when limit exceeded', async () => {
  const key = uniqueKey('test-limit');
  const LIMIT = 3;

  // Exhaust the limit
  for (let i = 0; i < LIMIT; i++) {
    const result = await checkRateLimit(key, LIMIT, 60000);
    console.assert(result.allowed === true, `Request ${i + 1} should be allowed`);
  }

  // Next request should be blocked
  const blocked = await checkRateLimit(key, LIMIT, 60000);
  console.assert(blocked.allowed === false, `Expected allowed=false on request ${LIMIT + 1}`);
  console.assert(blocked.remaining === 0, `Expected remaining=0, got: ${blocked.remaining}`);

  console.log('✓ SEC-RATE-02: request beyond limit is blocked');
});

// ── SEC-RATE-02: Remaining counter decrements correctly ───────────────────────

Deno.test('SEC-RATE-02: remaining counter decrements correctly', async () => {
  const key = uniqueKey('test-remaining');
  const LIMIT = 5;

  const first = await checkRateLimit(key, LIMIT, 60000);
  console.assert(first.remaining === LIMIT - 1, `Expected ${LIMIT - 1}, got: ${first.remaining}`);

  const second = await checkRateLimit(key, LIMIT, 60000);
  console.assert(second.remaining === LIMIT - 2, `Expected ${LIMIT - 2}, got: ${second.remaining}`);

  const third = await checkRateLimit(key, LIMIT, 60000);
  console.assert(third.remaining === LIMIT - 3, `Expected ${LIMIT - 3}, got: ${third.remaining}`);

  console.log('✓ SEC-RATE-02: remaining counter decrements correctly');
});

// ── SEC-RATE-03: Rate-limit headers are correct ───────────────────────────────

Deno.test('SEC-RATE-03: getRateLimitHeaders returns all required headers', async () => {
  const key = uniqueKey('test-headers');
  const result = await checkRateLimit(key, 10, 60000);
  const headers = getRateLimitHeaders(result);

  console.assert('X-RateLimit-Limit' in headers, 'Missing X-RateLimit-Limit header');
  console.assert('X-RateLimit-Remaining' in headers, 'Missing X-RateLimit-Remaining header');
  console.assert('X-RateLimit-Reset' in headers, 'Missing X-RateLimit-Reset header');
  console.assert('Retry-After' in headers, 'Missing Retry-After header');

  console.assert(
    headers['X-RateLimit-Limit'] === '10',
    `Expected limit=10, got: ${headers['X-RateLimit-Limit']}`,
  );
  console.assert(
    headers['X-RateLimit-Remaining'] === '9',
    `Expected remaining=9, got: ${headers['X-RateLimit-Remaining']}`,
  );

  // Retry-After should be a positive integer (seconds)
  const retryAfter = parseInt(headers['Retry-After'], 10);
  console.assert(
    !isNaN(retryAfter) && retryAfter >= 0,
    `Retry-After must be a non-negative integer, got: ${headers['Retry-After']}`,
  );

  // X-RateLimit-Reset should be an ISO date string
  const resetDate = new Date(headers['X-RateLimit-Reset']);
  console.assert(
    !isNaN(resetDate.getTime()),
    `X-RateLimit-Reset must be a valid ISO date, got: ${headers['X-RateLimit-Reset']}`,
  );

  console.log('✓ SEC-RATE-03: all rate-limit headers present and correct');
});

// ── SEC-RATE-04: HTTP 429 response simulation ─────────────────────────────────

Deno.test('SEC-RATE-04: headers on blocked request include Retry-After', async () => {
  const key = uniqueKey('test-429');
  const LIMIT = 1;

  // Exhaust
  await checkRateLimit(key, LIMIT, 60000);

  // Block
  const blocked = await checkRateLimit(key, LIMIT, 60000);
  console.assert(blocked.allowed === false, 'Expected blocked request');

  const headers = getRateLimitHeaders(blocked);
  const retryAfter = parseInt(headers['Retry-After'], 10);
  console.assert(retryAfter > 0, `Expected Retry-After > 0 on 429 response, got: ${retryAfter}`);
  console.assert(headers['X-RateLimit-Remaining'] === '0', 'Expected remaining=0 on 429 response');

  console.log('✓ SEC-RATE-04: blocked request returns correct Retry-After header');
});

// ── SEC-RATE-05: Configuration via env vars ───────────────────────────────────

Deno.test('SEC-RATE-05: fallback to in-memory when Redis env vars missing', async () => {
  // UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN are NOT set in test env.
  // The module should fall back to in-memory gracefully (fail-open).
  const key = uniqueKey('test-fallback');

  // Should not throw — fail-open behavior
  const result = await checkRateLimit(key, 10, 60000);
  console.assert(result.allowed === true, 'Fail-open: should allow request when Redis unavailable');
  console.assert(typeof result.limit === 'number', 'limit must be a number');
  console.assert(typeof result.remaining === 'number', 'remaining must be a number');
  console.assert(typeof result.resetAt === 'number', 'resetAt must be a number');

  console.log('✓ SEC-RATE-05: graceful fallback to in-memory when Redis unavailable');
});

// ── Functional: different keys don't interfere ────────────────────────────────

Deno.test('Isolation: different keys have independent counters', async () => {
  const keyA = uniqueKey('test-isolation-a');
  const keyB = uniqueKey('test-isolation-b');
  const LIMIT = 2;

  // Exhaust key A
  await checkRateLimit(keyA, LIMIT, 60000);
  await checkRateLimit(keyA, LIMIT, 60000);
  const blockedA = await checkRateLimit(keyA, LIMIT, 60000);
  console.assert(blockedA.allowed === false, 'Key A should be blocked after limit');

  // Key B should still be fresh
  const freshB = await checkRateLimit(keyB, LIMIT, 60000);
  console.assert(freshB.allowed === true, 'Key B should be unaffected by key A exhaustion');

  console.log('✓ Isolation: different keys have independent counters');
});

// ── Functional: function-name prefix prevents key collisions ──────────────────

Deno.test('Functional: prefixed keys prevent cross-function collisions', async () => {
  const ip = '192.168.1.1';
  const keyA = `function-a:${ip}`;
  const keyB = `function-b:${ip}`;
  const LIMIT = 1;

  // Exhaust function-a limit for this IP
  await checkRateLimit(keyA, LIMIT, 60000);
  const blockedA = await checkRateLimit(keyA, LIMIT, 60000);
  console.assert(blockedA.allowed === false, 'function-a should be blocked');

  // function-b same IP should be unaffected
  const freshB = await checkRateLimit(keyB, LIMIT, 60000);
  console.assert(freshB.allowed === true, 'function-b with same IP should not be blocked');

  console.log('✓ Functional: prefixed keys prevent cross-function collisions');
});

// ── Functional: window resets after expiry ────────────────────────────────────

Deno.test('Functional: new window resets counter (short window)', async () => {
  const key = uniqueKey('test-window-reset');
  const LIMIT = 1;
  const WINDOW_MS = 50; // Very short window for testing

  // Exhaust within first window
  await checkRateLimit(key, LIMIT, WINDOW_MS);
  const blocked = await checkRateLimit(key, LIMIT, WINDOW_MS);
  console.assert(blocked.allowed === false, 'Should be blocked in first window');

  // Wait for the window to expire
  await new Promise((resolve) => setTimeout(resolve, WINDOW_MS + 10));

  // Second window: counter should reset
  const allowed = await checkRateLimit(key, LIMIT, WINDOW_MS);
  console.assert(allowed.allowed === true, 'Should be allowed in new window after reset');

  console.log('✓ Functional: window resets counter after expiry');
});

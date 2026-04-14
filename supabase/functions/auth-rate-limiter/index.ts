/**
 * Auth Rate Limiter — Edge Function wrapper for Supabase Auth endpoints
 *
 * SECURITY: Applies rate limiting to /auth/v1/token?grant_type=password
 * to prevent brute-force and credential-stuffing attacks against login.
 *
 * Rate limit: 5 attempts per IP per 60 seconds (strict for auth).
 * Uses Upstash Redis via the shared rate-limiter module (distributed,
 * survives cold starts). Falls back to in-memory if Redis unavailable
 * (fail-open — auth remains available at reduced protection).
 *
 * Deploy: supabase functions deploy auth-rate-limiter
 * Route:  /auth/v1/token?grant_type=password → this function
 */

import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';

const RATE_LIMIT = 5;       // max attempts per window
const WINDOW_MS = 60_000;   // 1 minute window

Deno.serve(async (req: Request) => {
  // Support both POST (login) and potentially other grant types
  // Only apply strict rate limit to password grant; other flows use
  // a less strict limit defined elsewhere if needed.
  const url = new URL(req.url);
  const grantType = url.searchParams.get('grant_type');

  // Extract client IP from x-forwarded-for (set by Supabase gateway)
  const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
  const clientIp = forwardedFor.split(',')[0].trim() || 'unknown';

  // Key format: auth:login:<ip> — shared prefix avoids collisions
  const rateLimitKey = `auth:login:${clientIp}`;
  const rateLimitResult = await checkRateLimit(rateLimitKey, RATE_LIMIT, WINDOW_MS);

  if (!rateLimitResult.allowed) {
    const headers = getRateLimitHeaders(rateLimitResult);
    headers['Content-Type'] = 'application/json';
    return new Response(
      JSON.stringify({
        error: 'Too many requests. Please try again later.',
        message: 'Rate limit exceeded for login attempts.',
      }),
      { status: 429, headers },
    );
  }

  // Forward the request to the actual Supabase Auth endpoint
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const upstreamResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      // Forward relevant headers but strip internal ones
      'x-forwarded-for': clientIp,
    },
    body: await req.text(),
  });

  // Propagate upstream headers and add rate-limit context
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set('X-RateLimit-Remaining', String(rateLimitResult.remaining));
  // Include standard rate-limit headers for client visibility
  const rlHeaders = getRateLimitHeaders(rateLimitResult);
  for (const [k, v] of Object.entries(rlHeaders)) {
    responseHeaders.set(k, v);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
});

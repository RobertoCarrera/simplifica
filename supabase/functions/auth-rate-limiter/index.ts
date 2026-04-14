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
  const url = new URL(req.url);
  const grantType = url.searchParams.get('grant_type');

  // SECURITY: Extract client IP with multiple fallbacks ordered by trust.
  // x-forwarded-for can be spoofed by clients; we trust cf-connecting-ip
  // (set by Cloudflare at network edge) over x-forwarded-for.
  // When neither is available, derive a stable key from User-Agent to prevent
  // bypassing rate limiting by omitting all IP headers.
  const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
  const cfIp = req.headers.get('cf-connecting-ip') ?? '';
  const userAgent = req.headers.get('user-agent') ?? '';

  const rawIp = cfIp || forwardedFor.split(',')[0].trim();
  const clientIp = rawIp || 'unknown';

  // Fallback: hash User-Agent for stable key when IP unavailable
  const ipKey = clientIp !== 'unknown'
    ? clientIp
    : `ua:${userAgent.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)}`;

  const rateLimitKey = `auth:login:${ipKey}`;
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Build forwarding headers — do NOT pass through client-controlled
  // x-forwarded-for (could spoof IP). Supabase gateway sets the real one.
  const upstreamHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': anonKey,
  };
  // Only forward cf-connecting-ip as a trusted hint (set by Cloudflare edge)
  if (cfIp) upstreamHeaders['x-forwarded-for'] = cfIp;

  const upstreamResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: upstreamHeaders,
    body: await req.text(),
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set('X-RateLimit-Remaining', String(rateLimitResult.remaining));
  const rlHeaders = getRateLimitHeaders(rateLimitResult);
  for (const [k, v] of Object.entries(rlHeaders)) {
    responseHeaders.set(k, v);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
});

// ALLOW_ALL_ORIGINS: local dev only — enabled automatically when SUPABASE_URL is not https://
const IS_LOCAL_DEV = !(Deno.env.get('SUPABASE_URL') || '').startsWith('https://');
const ALLOW_ALL_ORIGINS = IS_LOCAL_DEV && Deno.env.get('ALLOW_ALL_ORIGINS') === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((o) => o.trim())
  .filter((o) => Boolean(o) && o !== '*'); // Never allow wildcard — explicit origins only

/**
 * Localhost origins for development. Covers the common dev-server
 * permutations Chromium / Firefox / Safari send in the Origin header —
 * including the `127.0.0.1` numeric form, the bracketed IPv6 form, and
 * the various SPA ports Angular / Vite / Astro use by default.
 */
const LOCALHOST_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:4201',
  'http://localhost:4300',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:4200',
  'http://127.0.0.1:4201',
  'http://127.0.0.1:4300',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000',
];

/** Returns true if the request comes from any localhost-style origin. */
function isLocalhostOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

/** Standard security headers baked into every CORS response. Centralized so
 *  every Edge Function automatically ships the hardening headers regardless
 *  of whether the function explicitly calls withSecurityHeaders. */
const SECURITY_HEADERS_BASE: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=(), display-capture=(), screen-wake-lock=(), web-share=(), xr-spatial-tracking=()',
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-DNS-Prefetch-Control': 'off',
  'Content-Security-Policy': "default-src 'none'",
};

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = (typeof req?.headers?.get === 'function') ? req.headers.get('origin') : null;
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-csrf-token, x-internal-call, x-supabase-api-version',
    'Access-Control-Max-Age': '86400', // cache preflight 24h to avoid extra round-trips
    Vary: 'Origin',
    ...SECURITY_HEADERS_BASE,
  };

  if (origin && (ALLOW_ALL_ORIGINS || ALLOWED_ORIGINS.includes(origin) || LOCALHOST_ORIGINS.includes(origin) || isLocalhostOrigin(origin))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

export function handleCorsOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    // Explicit 200 + CORS headers. Some browsers reject preflights that
    // don't return a 2xx, and Supabase Edge Runtime's default Response can
    // occasionally surface as non-OK if the body is empty/odd. Be explicit.
    return new Response(null, {
      status: 200,
      headers: getCorsHeaders(req),
    });
  }
  return null;
}

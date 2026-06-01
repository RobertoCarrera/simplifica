// ALLOW_ALL_ORIGINS: local dev only — enabled automatically when SUPABASE_URL is not https://
const IS_LOCAL_DEV = !(Deno.env.get('SUPABASE_URL') || '').startsWith('https://');
const ALLOW_ALL_ORIGINS = IS_LOCAL_DEV && Deno.env.get('ALLOW_ALL_ORIGINS') === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((o) => o.trim())
  .filter((o) => Boolean(o) && o !== '*'); // Never allow wildcard — explicit origins only

// Localhost origins for development — always allowed
const LOCALHOST_ORIGINS = ['http://localhost:4200', 'http://localhost:5173'];

export function getCorsHeaders(req: Request): HeadersInit {
  const origin = (typeof req?.headers?.get === 'function') ? req.headers.get('origin') : null;
  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };

  if (origin && (ALLOW_ALL_ORIGINS || ALLOWED_ORIGINS.includes(origin) || LOCALHOST_ORIGINS.includes(origin))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

export function handleCorsOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  return null;
}

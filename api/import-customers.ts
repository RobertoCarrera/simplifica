// Vercel Serverless Function: same-origin proxy to Supabase Edge Function for customers import
// Forwards POST /api/import-customers -> Supabase functions/v1/import-customers
// Optionally set env SUPABASE_FUNCTIONS_URL to override the default target URL

const TARGET_URL = process.env['SUPABASE_FUNCTIONS_URL'] ||
  'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/import-customers';
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'];

function getCorsHeaders(origin?: string) {
  const allowAll = (process.env['ALLOW_ALL_ORIGINS'] || 'false').toLowerCase() === 'true';
  const allowedOrigins = (process.env['ALLOWED_ORIGINS'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowedOrigins.includes(origin));
  return {
    'Access-Control-Allow-Origin': isAllowed && origin ? origin : (allowAll ? '*' : ''),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
    'Vary': 'Origin'
  } as Record<string, string>;
}

function isAllowedOrigin(origin?: string) {
  const allowAll = (process.env['ALLOW_ALL_ORIGINS'] || 'false').toLowerCase() === 'true';
  if (allowAll) return true;
  const allowedOrigins = (process.env['ALLOWED_ORIGINS'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return !!origin && allowedOrigins.includes(origin!);
}

export default async function handler(req: any, res: any) {
  try {
    const origin = req.headers?.origin as string | undefined;
    const corsHeaders = getCorsHeaders(origin);

    // Preflight
    if (req.method === 'OPTIONS') {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      res.status(204).end();
      return;
    }

    // Enforce allowed origin for non-GET/OPTIONS
    if (!isAllowedOrigin(origin)) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }

    const method = req.method || 'POST';
    const body = method === 'GET' || method === 'HEAD' ? undefined : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const auth = req.headers?.authorization as string | undefined;
    if (auth) {
      headers['Authorization'] = auth;
    } else if (SUPABASE_ANON_KEY) {
      headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
    }

    headers['x-forwarded-method'] = method;

    // Debug log for Vercel logs
    console.log('Proxy: forwarding', { method, target: TARGET_URL, origin });

    const upstream = await fetch(TARGET_URL, {
      method,
      headers,
      body,
    });

    const text = await upstream.text();

    // Mirror CORS headers
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    const ct = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.setHeader('Content-Type', ct);
    res.status(upstream.status).send(text);
  } catch (err: any) {
    const origin = req.headers?.origin as string | undefined;
    const corsHeaders = getCorsHeaders(origin);
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    res.status(502).json({ error: 'Proxy error', detail: err?.message || String(err) });
  }
}

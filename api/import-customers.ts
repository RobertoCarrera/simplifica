// Vercel Serverless Function: same-origin proxy to Supabase Edge Function for customers import
// Forwards POST /api/import-customers -> Supabase functions/v1/import-customers
// Optionally set env SUPABASE_FUNCTIONS_URL to override the default target URL

const TARGET_URL = process.env['SUPABASE_FUNCTIONS_URL'] ||
  'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/import-customers';
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'];

function cors(res: any, origin?: string) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

export default async function handler(req: any, res: any) {
  try {
    const origin = req.headers?.origin as string | undefined;
    if (req.method === 'OPTIONS') {
      cors(res, origin);
      res.status(204).end();
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
    const upstream = await fetch(TARGET_URL, {
      method,
      headers,
      body,
    });

    const text = await upstream.text();

    cors(res, origin);
    const ct = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.setHeader('Content-Type', ct);
    res.status(upstream.status).send(text);
  } catch (err: any) {
    cors(res);
    res.status(502).json({ error: 'Proxy error', detail: err?.message || String(err) });
  }
}

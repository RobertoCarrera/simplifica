// Supabase Edge Function: create-locality
// Deploy path: functions/v1/create-locality
// Secrets required: SERVICE_ROLE_KEY and SUPABASE_URL

declare const Deno: any;

function getCorsHeaders(origin?: string) {
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowedOrigins.includes(origin));
  return {
    'Access-Control-Allow-Origin': isAllowed && origin ? origin : (allowAll ? '*' : ''),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
    'Vary': 'Origin'
  } as Record<string, string>;
}

function isAllowedOrigin(origin?: string) {
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
  if (allowAll) return true;
  if (!origin) return true; // allow server-to-server
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  return allowedOrigins.includes(origin!);
}

export default async (req: Request) => {
  const origin = req.headers.get('Origin');

  // Fast-path OPTIONS preflight: respond immediately with permissive CORS headers
  if (req.method === 'OPTIONS') {
    // Log arrival of preflight so we can see it in function logs (fast and synchronous)
    try {
      console.log('EdgeFn OPTIONS preflight received', { origin });
    } catch (e) {
      // ignore logging failures
    }
    const preflightHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
      'Vary': 'Origin'
    };
    return new Response(null, { status: 204, headers: preflightHeaders });
  }

  const corsHeaders = getCorsHeaders(origin ?? undefined);
  try {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const URL_SUPABASE = Deno.env.get('URL_SUPABASE') || Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!URL_SUPABASE || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing supabase URL or service_role key in env.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(URL_SUPABASE, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    if (!isAllowedOrigin(origin ?? undefined)) return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Expect Authorization: Bearer <jwt> - we will validate caller and optionally enforce access
    const authHeader = (req.headers.get('authorization') || '').trim();
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization Bearer token required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  const payload = await req.json().catch(() => ({}));
  const { p_name, p_province, p_country, p_postal_code } = payload;
  console.log('EdgeFn POST invoked', { origin, pathname: '/functions/v1/create-locality', receivedAt: new Date().toISOString() });
  console.log('Auth header present?', !!(req.headers.get('authorization') || '').trim());
  console.log('Payload', { p_name, p_province, p_country, p_postal_code });
    if (!p_name || !p_postal_code) {
      return new Response(JSON.stringify({ error: 'Missing required fields p_name or p_postal_code' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Optionally: validate token and map to app user/company as in import-customers
    // For now enforce presence only

    const start = Date.now();
    try {
      console.log('Calling RPC insert_or_get_locality');
      const { data, error } = await supabaseAdmin.rpc('insert_or_get_locality', { p_name, p_province, p_country, p_postal_code });
      const duration = Date.now() - start;
      if (error) {
        console.error('RPC error', error);
        return new Response(JSON.stringify({ error: error.message || error }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      console.log('RPC succeeded', { duration, resultSample: Array.isArray(data) ? data[0] : data });
      return new Response(JSON.stringify({ result: data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (rpcEx: any) {
      console.error('RPC exception', rpcEx);
      return new Response(JSON.stringify({ error: rpcEx?.message || String(rpcEx) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (err: any) {
    console.error('Function exception', err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500, headers: { ...getCorsHeaders(req.headers.get('Origin') ?? undefined), 'Content-Type': 'application/json' } });
  }
};

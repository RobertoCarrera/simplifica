// Supabase Edge Function: import-customers
// Deploy path: functions/v1/import-customers
// Secrets required: SERVICE_ROLE_KEY (service_role key) and SUPABASE_URL (or URL_SUPABASE).

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
  // Allow server-to-server calls where Origin is absent
  if (!origin) return true;
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  return allowedOrigins.includes(origin!);
}

export default async (req: Request) => {
  try {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin ?? undefined);

    // Handle CORS preflight (enforce allowed origin)
    if (req.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin ?? undefined)) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      // Mirror CORS headers for non-allowed methods
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const URL_SUPABASE = Deno.env.get('URL_SUPABASE') || Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!URL_SUPABASE || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing supabase URL or service_role key in env.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(URL_SUPABASE, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Enforce allowed origin for actual calls
    if (!isAllowedOrigin(origin ?? undefined)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const payload = await req.json().catch(() => ({}));
    const rows = Array.isArray(payload.rows) ? payload.rows : [];

    if (rows.length === 0) return new Response(JSON.stringify({ inserted: [] }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    // Require Authorization Bearer token in production: validate token and derive auth_user_id
    const authHeader = (req.headers.get('authorization') || '').trim();
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization Bearer token required' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    let authUserId: string | null = null;
    let authoritativeCompanyId: string | null = null;
    try {
      const token = authHeader.split(' ')[1];
      const userResp = await fetch(`${URL_SUPABASE.replace(/\/$/, '')}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!userResp.ok) {
        return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      const userJson = await userResp.json().catch(() => ({}));
      authUserId = userJson?.id || null;
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Token validation failed' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // Map auth_user_id to application user and get company_id. If no mapping, reject (403)
    if (authUserId) {
      const { data: appUsers } = await supabaseAdmin
        .from('users')
        .select('company_id')
        .eq('auth_user_id', authUserId)
        .limit(1);
      if (appUsers && appUsers.length) authoritativeCompanyId = appUsers[0].company_id || null;
    }

    if (!authoritativeCompanyId) {
      return new Response(JSON.stringify({ error: 'Authenticated user has no associated company (forbidden)' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const inserted: any[] = [];
    for (const r of rows) {
      // Normalize required fields. Support 'surname' as incoming header which maps to 'apellidos'
      const name = r.name || r.nombre || '';
      const surname = r.surname || r.apellidos || r.last_name || '';
      const email = r.email || r.correo || null;

      const row: any = {
        name: name || 'Cliente importado',
        apellidos: surname || undefined,
        email,
        phone: r.phone || r.telefono || null,
        dni: r.dni || r.nif || null,
        company_id: authoritativeCompanyId || r.company_id || null,
        created_at: new Date().toISOString()
      };

      // Attach metadata column if provided (string or object)
      if (r.metadata) {
        try {
          row.metadata = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
        } catch (e) {
          // If parsing fails, store raw string under metadata_raw
          row.metadata_raw = r.metadata;
        }
      }

      if (!email) {
        inserted.push({ error: 'missing email', row });
        continue;
      }

      try {
        const { data: created, error } = await supabaseAdmin
          .from('clients')
          .insert([row])
          .select()
          .limit(1);

        if (error) {
          inserted.push({ error: error.message || error, row });
          continue;
        }

        const svc = Array.isArray(created) ? created[0] : created;
        inserted.push(svc);
      } catch (err: any) {
        inserted.push({ error: err?.message || String(err), row });
      }
    }

    return new Response(JSON.stringify({ inserted }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('Function error', err);
    return new Response(JSON.stringify({ error: err && err.message ? err.message : String(err) }), { status: 500, headers: { ...getCorsHeaders(req.headers.get('Origin') ?? undefined), 'Content-Type': 'application/json' } });
  }
};

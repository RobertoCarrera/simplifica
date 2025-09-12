// Supabase Edge Function: import-customers
// Deploy path: functions/v1/import-customers
// Secrets required: SERVICE_ROLE_KEY (service_role key) and SUPABASE_URL (or URL_SUPABASE).

declare const Deno: any;

export default async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const URL_SUPABASE = Deno.env.get('URL_SUPABASE') || Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!URL_SUPABASE || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing supabase URL or service_role key in env.' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(URL_SUPABASE, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

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
      return new Response(JSON.stringify({ error: 'Authenticated user has no associated company (forbidden)' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const inserted: any[] = [];
    for (const r of rows) {
      const row: any = {
        name: r.name || r.nombre || 'Cliente importado',
        email: r.email || r.correo || null,
        phone: r.phone || r.telefono || null,
        dni: r.dni || r.nif || null,
        company_id: authoritativeCompanyId || r.company_id || null,
        created_at: new Date().toISOString()
      };

      if (!row.email) {
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

    return new Response(JSON.stringify({ inserted }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (err: any) {
    console.error('Function error', err);
    return new Response(JSON.stringify({ error: err && err.message ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
};

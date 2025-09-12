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
  console.log('import-customers function invoked');

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

  // Import Supabase client (Edge Functions support npm packages)
  const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(URL_SUPABASE, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Enforce allowed origin for actual calls
    if (!isAllowedOrigin(origin ?? undefined)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const payload = await req.json().catch(() => ({}));
    const rows = Array.isArray(payload.rows) ? payload.rows : [];

  if (rows.length === 0) return new Response(JSON.stringify({ inserted: [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Require Authorization Bearer token in production: validate token and derive auth_user_id
    const authHeader = (req.headers.get('authorization') || '').trim();
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization Bearer token required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let authUserId: string | null = null;
    let authoritativeCompanyId: string | null = null;
    try {
      const token = authHeader.split(' ')[1];
      const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      authUserId = userData.user.id;
    } catch (e) {
      const msg = (e && typeof e === 'object' && 'message' in e) ? (e as any).message : String(e);
      console.error('Token validation exception', msg);
      return new Response(JSON.stringify({ error: 'Token validation failed' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Map auth_user_id to application user and get company_id. If no mapping, reject (403)
    if (authUserId) {
      console.log('Validating auth user id, looking up app user', { authUserId });
      const { data: appUsers, error: appUsersErr } = await supabaseAdmin
        .from('users')
        .select('company_id')
        .eq('auth_user_id', authUserId)
        .limit(1);
      if (appUsersErr) {
        console.error('Error querying users table for auth mapping', appUsersErr);
      }
      if (appUsers && appUsers.length) {
        authoritativeCompanyId = appUsers[0].company_id || null;
      }
    }

    if (!authoritativeCompanyId) {
      return new Response(JSON.stringify({ error: 'Authenticated user has no associated company (forbidden)' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Beginning import of rows', { count: rows.length, companyId: authoritativeCompanyId });
    const prepared: any[] = [];
    const errors: any[] = [];

    for (const r of rows) {
      const name = r.name || r.nombre || '';
      const surname = r.surname || r.apellidos || r.last_name || '';
      const email = r.email || r.correo || null;
      const row: any = {
        name: name || 'Cliente importado',
        apellidos: surname || undefined,
        email,
        phone: r.phone || r.telefono || null,
        dni: r.dni || r.nif || null,
        company_id: authoritativeCompanyId,
        created_at: new Date().toISOString()
      };
      if (r.metadata) {
        try {
          row.metadata = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
        } catch (e) {
          row.metadata_raw = r.metadata;
        }
      }
      if (!email) {
        errors.push({ error: 'missing email', row });
        continue;
      }
      prepared.push(row);
    }

    const inserted: any[] = [];
    // Insert in chunks to reduce roundtrips and avoid payload/timeouts
    const chunkSize = 100;
    for (let i = 0; i < prepared.length; i += chunkSize) {
      const chunk = prepared.slice(i, i + chunkSize);
      try {
        const { data, error } = await supabaseAdmin.from('clients').insert(chunk).select();
        if (error) {
          console.warn('Batch insert failed, falling back to per-row', { i, count: chunk.length, error: error.message || error });
          // Per-row fallback for this chunk
          for (const row of chunk) {
            try {
              const { data: one, error: oneErr } = await supabaseAdmin.from('clients').insert([row]).select().limit(1);
              if (oneErr) {
                errors.push({ error: oneErr.message || oneErr, row });
              } else {
                const created = Array.isArray(one) ? one[0] : one;
                inserted.push(created);
              }
            } catch (e: any) {
              errors.push({ error: e?.message || String(e), row });
            }
          }
        } else {
          if (Array.isArray(data)) inserted.push(...data); else if (data) inserted.push(data);
        }
      } catch (e: any) {
        console.warn('Chunk insert exception, falling back to per-row', { i, count: chunk.length, err: e?.message || String(e) });
        for (const row of chunk) {
          try {
            const { data: one, error: oneErr } = await supabaseAdmin.from('clients').insert([row]).select().limit(1);
            if (oneErr) {
              errors.push({ error: oneErr.message || oneErr, row });
            } else {
              const created = Array.isArray(one) ? one[0] : one;
              inserted.push(created);
            }
          } catch (ee: any) {
            errors.push({ error: ee?.message || String(ee), row });
          }
        }
      }
    }

    return new Response(JSON.stringify({ inserted, errors }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('Function error', err, err?.stack);
    const body = { error: err && err.message ? err.message : String(err) } as any;
    // Include stack for debugging (remove in production)
    if (err?.stack) body.stack = err.stack;
    return new Response(JSON.stringify(body), { status: 500, headers: { ...getCorsHeaders(req.headers.get('Origin') ?? undefined), 'Content-Type': 'application/json' } });
  }
};

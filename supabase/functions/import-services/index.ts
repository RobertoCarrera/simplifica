// Supabase Edge Function: import-services
// Deploy path: functions/v1/import-services
// Secrets required: SERVICE_ROLE_KEY (service_role key). URL_SUPABASE is read from env (secret name: URL_SUPABASE).

// This function receives POST JSON: { rows: [ ... ], upsertCategory: boolean }
// It inserts services using the service_role key (bypassing RLS). It also can create categories/tags.

// Note: this file targets Supabase Edge Function runtime (Deno).
// If your editor linter complains about 'Deno', you can ignore it in this file.

declare const Deno: any;

export default async (req: Request) => {
  try {
    // Handle CORS preflight
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

  // Normalize method to avoid narrow literal type comparisons in this environment
  const method = String(req.method || '').toUpperCase();

  // Allow GET healthcheck to confirm function presence
  if (method === 'GET') {
      return new Response(JSON.stringify({ ok: true, message: 'import-services function' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

  if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    // Read URL and service role key secrets. Accept both the explicit names used in this file
    // and the common secret names shown in the dashboard (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
    const URL_SUPABASE = Deno.env.get('URL_SUPABASE') || Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!URL_SUPABASE || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing supabase URL or service_role key in env. Set either URL_SUPABASE & SERVICE_ROLE_KEY or SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY as function secrets.' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // Lazy import to keep bundle small
    const { createClient } = await import('@supabase/supabase-js');
    // Ensure we use the service_role key (admin) for all DB ops
    const supabaseAdmin = createClient(URL_SUPABASE, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Basic healthcheck for GET (helps proxy/domains verifying function presence)
    if (req.method === 'GET') {
      return new Response(JSON.stringify({ ok: true, message: 'import-services function' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // Security: determine company_id from the authenticated user token passed by the client.
    // Don't trust client-provided company_id.
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Authorization Bearer token in request. Batch import requires authenticated user token.' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // Validate token against Supabase Auth endpoint
    const userResp = await fetch(`${URL_SUPABASE.replace(/\/$/, '')}/auth/v1/user`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!userResp.ok) {
      const txt = await userResp.text().catch(() => '');
      return new Response(JSON.stringify({ error: 'Unable to validate user token', detail: txt }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    const userJson = await userResp.json().catch(() => ({}));
    const authUserId = (userJson && (userJson.id || (userJson.user && userJson.user.id))) || null;
    if (!authUserId) {
      return new Response(JSON.stringify({ error: 'Invalid user token; no user id found' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // Lookup application user to get the authoritative company_id
    const { data: appUsers, error: appUserErr } = await supabaseAdmin
      .from('users')
      .select('company_id')
      .eq('auth_user_id', authUserId)
      .limit(1);
    if (appUserErr) {
      return new Response(JSON.stringify({ error: 'Error looking up app user', detail: appUserErr.message || appUserErr }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    const companyIdFromUser = Array.isArray(appUsers) && appUsers.length ? appUsers[0].company_id : null;
    if (!companyIdFromUser) {
      return new Response(JSON.stringify({ error: 'Authenticated user has no company_id associated' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const payload = await req.json().catch(() => ({}));
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const upsertCategory = !!payload.upsertCategory;

  if (rows.length === 0) return new Response(JSON.stringify({ inserted: [] }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    const inserted: any[] = [];

    for (const r of rows) {
      // Basic normalization
      const row: any = {
        name: r.name || r.nombre || 'Servicio importado',
        description: r.description || r.descripcion || '',
        base_price: r.base_price != null ? Number(r.base_price) : 0,
        estimated_hours: r.estimated_hours != null ? Number(r.estimated_hours) : 0,
        // Enforce server-side company_id derived from the authenticated user (prevent tampering)
        company_id: companyIdFromUser,
        tax_rate: r.tax_rate != null ? Number(r.tax_rate) : null
      };

      // Resolve or create category if provided as name
      if (r.category_name || r.category) {
        const catName = r.category_name || r.category;
        // If client provided uuid, use it directly
        if (/^[0-9a-fA-F-]{36}$/.test(String(catName))) {
          row.category = catName;
        } else if (upsertCategory && companyIdFromUser) {
          // Try to find
          const { data: foundCats, error: findErr } = await supabaseAdmin
            .from('service_categories')
            .select('id')
            .eq('company_id', companyIdFromUser)
            .ilike('name', catName)
            .limit(1);
          if (!findErr && foundCats && foundCats.length) row.category = foundCats[0].id;
          else {
            const { data: newCat, error: createCatErr } = await supabaseAdmin
              .from('service_categories')
              .insert({ name: catName, company_id: companyIdFromUser, is_active: true })
              .select()
              .limit(1);
            if (!createCatErr && newCat && newCat.length) row.category = newCat[0].id;
          }
        }
      }

      // Insert service
      const { data: createdSvc, error: svcErr } = await supabaseAdmin
        .from('services')
        .insert([row])
        .select()
        .limit(1);

      if (svcErr) {
        // return error for this row but continue with others
        inserted.push({ error: svcErr.message || svcErr, row });
        continue;
      }

      const svc = Array.isArray(createdSvc) ? createdSvc[0] : createdSvc;

      // Handle tags if provided (array or pipe-separated string)
      const tagNames: string[] = [];
      if (Array.isArray(r.tags)) tagNames.push(...r.tags.map(String));
      else if (typeof r.tags === 'string') tagNames.push(...r.tags.split('|').map((s: string) => s.trim()).filter(Boolean));

      if (tagNames.length > 0 && svc && svc.id && svc.company_id) {
        // create missing tags
        const uniqueNames = Array.from(new Set(tagNames.map(n => n.toLowerCase())));
        // fetch existing
        const { data: existingTags } = await supabaseAdmin
          .from('service_tags')
          .select('id,name')
          .eq('company_id', svc.company_id)
          .in('name', uniqueNames.map(n => n));

        const existingMap = new Map((existingTags || []).map((t: any) => [t.name.toLowerCase(), t.id]));
        const toCreate = uniqueNames.filter(n => !existingMap.has(n)).map(n => ({ name: n, company_id: svc.company_id, is_active: true }));
        if (toCreate.length) {
          const { data: newTags } = await supabaseAdmin.from('service_tags').insert(toCreate).select();
          (newTags || []).forEach((t: any) => existingMap.set(t.name.toLowerCase(), t.id));
        }

        const tagIds = uniqueNames.map(n => existingMap.get(n)).filter(Boolean);
        if (tagIds.length) {
          const relations = tagIds.map((tid: string) => ({ service_id: svc.id, tag_id: tid }));
          await supabaseAdmin.from('service_tag_relations').insert(relations).select();
        }
      }

      inserted.push(svc);
    }

  return new Response(JSON.stringify({ inserted }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (err: any) {
    console.error('Function error', err);
  return new Response(JSON.stringify({ error: err && err.message ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
};

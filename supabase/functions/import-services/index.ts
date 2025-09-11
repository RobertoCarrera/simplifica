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
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // Read URL secret set in Supabase (secret name should be URL_SUPABASE per project settings)
  const SUPABASE_URL = Deno.env.get('URL_SUPABASE') || Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SERVICE_ROLE_KEY in env' }), { status: 500 });
    }

    // Lazy import to keep bundle small
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const payload = await req.json().catch(() => ({}));
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const upsertCategory = !!payload.upsertCategory;

    if (rows.length === 0) return new Response(JSON.stringify({ inserted: [] }), { status: 200 });

    const inserted: any[] = [];

    for (const r of rows) {
      // Basic normalization
      const row: any = {
        name: r.name || r.nombre || 'Servicio importado',
        description: r.description || r.descripcion || '',
        base_price: r.base_price != null ? Number(r.base_price) : 0,
        estimated_hours: r.estimated_hours != null ? Number(r.estimated_hours) : 0,
        company_id: r.company_id || r.company || null,
        tax_rate: r.tax_rate != null ? Number(r.tax_rate) : null
      };

      // Resolve or create category if provided as name
      if (r.category_name || r.category) {
        const catName = r.category_name || r.category;
        // If client provided uuid, use it directly
        if (/^[0-9a-fA-F-]{36}$/.test(String(catName))) {
          row.category = catName;
        } else if (upsertCategory && row.company_id) {
          // Try to find
          const { data: foundCats, error: findErr } = await supabaseAdmin
            .from('service_categories')
            .select('id')
            .eq('company_id', row.company_id)
            .ilike('name', catName)
            .limit(1);
          if (!findErr && foundCats && foundCats.length) row.category = foundCats[0].id;
          else {
            const { data: newCat, error: createCatErr } = await supabaseAdmin
              .from('service_categories')
              .insert({ name: catName, company_id: row.company_id, is_active: true })
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

    return new Response(JSON.stringify({ inserted }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('Function error', err);
    return new Response(JSON.stringify({ error: err && err.message ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

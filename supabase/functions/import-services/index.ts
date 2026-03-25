// Edge Function: import-services (Deno serve pattern)
// Deploy path: functions/v1/import-services
// Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// CORS controlled by: ALLOWED_ORIGINS (comma-separated)

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';

function getCorsHeaders(origin?: string) {
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isAllowed = origin && allowedOrigins.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  } as Record<string, string>;
}

function isAllowedOrigin(origin?: string) {
  if (!origin) return true;
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowedOrigins.includes(origin);
}

serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    try {
      console.log('import-services OPTIONS preflight', { origin });
    } catch {}
    return new Response('ok', { headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
  }

  // Health-check GET
  if (req.method === 'GET') {
    if (!isAllowedOrigin(origin)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, function: 'import-services' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', allowed: ['GET', 'POST', 'OPTIONS'] }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Enforce allowed origins
  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Rate limiting: 5 req/min per IP (bulk import of up to 2000 services)
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`import-services:${ip}`, 5, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('URL_SUPABASE') || '';
    const SERVICE_ROLE_KEY =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || '';
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing Supabase env configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Require Authorization: Bearer <jwt>
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization Bearer token required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Resolve user and tenant company_id from JWT
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken as any);
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userEmail = (userRes.user.email || '').toLowerCase();
    let tenantCompanyId: string | null = null;
    // Try users_with_company view by email
    try {
      const { data: uwc } = await supabaseAdmin
        .from('users_with_company')
        .select('company_id')
        .ilike('email', userEmail)
        .limit(1);
      if (uwc && uwc.length && uwc[0]?.company_id) tenantCompanyId = uwc[0].company_id;
    } catch (_) {
      /* ignore */
    }
    // Fallback: users table by email
    if (!tenantCompanyId) {
      try {
        const { data: u } = await supabaseAdmin
          .from('users')
          .select('company_id, email')
          .ilike('email', userEmail)
          .limit(1);
        if (u && u.length && u[0]?.company_id) tenantCompanyId = u[0].company_id;
      } catch (_) {
        /* ignore */
      }
    }
    if (!tenantCompanyId) {
      return new Response(JSON.stringify({ error: 'User has no associated company_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Role check: only owner/admin can perform bulk service imports
    const { data: userRole } = await supabaseAdmin
      .from('users')
      .select('app_role:app_roles(name)')
      .eq('auth_user_id', userRes.user.id)
      .single();
    const roleName = (userRole as any)?.app_role?.name;
    if (!['owner', 'admin'].includes(roleName)) {
      return new Response(JSON.stringify({ error: 'Only owner or admin can import services' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json().catch(() => ({}));
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const upsertCategory = !!payload.upsertCategory;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ inserted: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (rows.length > 2000) {
      return new Response(JSON.stringify({ error: 'Maximum 2000 rows per import' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('import-services: payload rows=', rows.length, 'upsertCategory=', upsertCategory);
    const inserted: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const providedName = (r.name || r.nombre || '').toString().trim();
      const rawPrice = r.base_price ?? r.price ?? r.precio;
      const hasName = providedName.length > 0;
      const hasPrice =
        rawPrice !== undefined && rawPrice !== null && !Number.isNaN(Number(rawPrice));
      const effectiveName = hasName ? providedName : `Servicio`;
      const effectivePrice = hasPrice ? Number(rawPrice) : 0;
      if (!isFinite(effectivePrice) || effectivePrice < 0) {
        inserted.push({ row: i, skipped: true, reason: 'invalid_price' });
        continue;
      }

      const row: any = {
        name: effectiveName,
        description: r.description || r.descripcion || '',
        base_price: effectivePrice,
        estimated_hours: r.estimated_hours != null ? Number(r.estimated_hours) : 0,
        // Enforce tenant company from JWT, ignore payload-provided company
        company_id: tenantCompanyId,
        tax_rate: r.tax_rate != null ? Number(r.tax_rate) : null,
      };

      // Metadata flags for incomplete rows
      const attention_reasons: string[] = [];
      if (!hasName) attention_reasons.push('name_missing');
      if (!hasPrice) attention_reasons.push('price_missing');
      if (attention_reasons.length) {
        row.metadata = {
          ...(r.metadata && (typeof r.metadata === 'object' ? r.metadata : {})),
          needs_attention: true,
          attention_reasons,
          inactive_on_import: true,
        };
        // Mark inactive service for review
        row.active = false;
      }

      if (r.category_name || r.category) {
        const catName = r.category_name || r.category;
        if (/^[0-9a-fA-F-]{36}$/.test(String(catName))) {
          row.category = catName;
        } else if (upsertCategory && row.company_id) {
          const { data: foundCats } = await supabaseAdmin
            .from('service_categories')
            .select('id')
            .eq('company_id', row.company_id)
            .ilike('name', catName)
            .limit(1);
          if (foundCats && foundCats.length) row.category = foundCats[0].id;
          else {
            const { data: newCat } = await supabaseAdmin
              .from('service_categories')
              .insert({ name: catName, company_id: row.company_id, is_active: true })
              .select()
              .limit(1);
            if (newCat && newCat.length) row.category = newCat[0].id;
          }
        }
      }

      let svc: any = null;
      try {
        const insertRow: any = { ...row };
        let { data: createdSvc, error: svcErr } = await supabaseAdmin
          .from('services')
          .insert([insertRow])
          .select()
          .limit(1);
        if (svcErr) {
          const msg = String((svcErr as any)?.message || svcErr);
          // If metadata column doesn't exist, retry without metadata
          if (
            msg.toLowerCase().includes('column') &&
            msg.toLowerCase().includes('metadata') &&
            msg.toLowerCase().includes('does not exist')
          ) {
            try {
              delete insertRow.metadata;
              const retry = await supabaseAdmin
                .from('services')
                .insert([insertRow])
                .select()
                .limit(1);
              createdSvc = retry.data as any;
              svcErr = retry.error as any;
            } catch (_) {
              /* ignore */
            }
          }
          // Handle unique constraint (name, company_id)
          if (String((svcErr as any)?.code) === '23505') {
            try {
              const { data: existing } = await supabaseAdmin
                .from('services')
                .select('*')
                .eq('company_id', tenantCompanyId)
                .eq('name', row.name)
                .limit(1);
              if (existing && existing.length) {
                svc = existing[0];
              } else {
                console.warn('import-services: duplicate reported but existing not found', row);
                inserted.push({ error: 'Duplicate entry, existing not found', row });
                continue;
              }
            } catch (fetchErr) {
              console.warn('import-services: failed to fetch existing after duplicate', fetchErr);
              inserted.push({ error: 'Duplicate fetch failed', row });
              continue;
            }
          } else {
            console.warn('import-services: insert error for row', row, svcErr);
            inserted.push({ error: 'Insert failed', row });
            continue;
          }
        } else {
          svc = Array.isArray(createdSvc) ? createdSvc[0] : createdSvc;
        }
      } catch (rowErr) {
        console.error('import-services: exception inserting row', row, rowErr);
        inserted.push({ error: 'Row processing failed', row });
        continue;
      }

      const tagNames: string[] = [];
      if (Array.isArray(r.tags)) tagNames.push(...r.tags.map(String));
      else if (typeof r.tags === 'string')
        tagNames.push(
          ...r.tags
            .split('|')
            .map((s: string) => s.trim())
            .filter(Boolean),
        );

      // Limit tag count and sanitize tag names
      tagNames.splice(50);
      for (let ti = 0; ti < tagNames.length; ti++) {
        tagNames[ti] = tagNames[ti].substring(0, 100).replace(/<[^>]*>/g, '');
      }
      const filteredTags = tagNames.filter(Boolean);

      if (filteredTags.length > 0 && svc && svc.id && svc.company_id) {
        const uniqueNames = Array.from(new Set(filteredTags.map((n) => n.toLowerCase())));
        const { data: existingTags } = await supabaseAdmin
          .from('service_tags')
          .select('id,name')
          .eq('company_id', svc.company_id)
          .in(
            'name',
            uniqueNames.map((n) => n),
          );
        const existingMap = new Map(
          (existingTags || []).map((t: any) => [t.name.toLowerCase(), t.id]),
        );
        const toCreate = uniqueNames
          .filter((n) => !existingMap.has(n))
          .map((n) => ({ name: n, company_id: svc.company_id, is_active: true }));
        if (toCreate.length) {
          // Use upsert on (company_id, name) to avoid conflicts when tags already exist
          try {
            const { data: newTags, error: upsertErr } = await supabaseAdmin
              .from('service_tags')
              .upsert(toCreate, { onConflict: 'company_id,name' })
              .select();
            if (upsertErr) {
              console.warn('import-services: warning upserting tags', upsertErr);
            }
            (newTags || []).forEach((t: any) =>
              existingMap.set(String(t.name).toLowerCase(), t.id),
            );
          } catch (e) {
            console.warn(
              'import-services: unexpected error upserting tags, falling back to insert try',
              e,
            );
            try {
              const { data: newTags } = await supabaseAdmin
                .from('service_tags')
                .insert(toCreate)
                .select();
              (newTags || []).forEach((t: any) =>
                existingMap.set(String(t.name).toLowerCase(), t.id),
              );
            } catch (e2) {
              console.warn('import-services: failed to create tags', e2);
            }
          }
        }
        const tagIds = uniqueNames.map((n) => existingMap.get(n)).filter(Boolean);
        if (tagIds.length) {
          const relations = tagIds.map((tid: string) => ({ service_id: svc.id, tag_id: tid }));
          try {
            // Use upsert on the relation primary key (service_id, tag_id) to ignore duplicates
            const { error: relErr } = await supabaseAdmin
              .from('service_tag_relations')
              .upsert(relations, { onConflict: 'service_id,tag_id' });
            if (relErr) {
              console.warn('import-services: warning upserting tag relations', relErr, relations);
            }
          } catch (relErr) {
            console.warn(
              'import-services: failed to upsert tag relations, falling back to insert',
              relErr,
              relations,
            );
            try {
              await supabaseAdmin.from('service_tag_relations').insert(relations).select();
            } catch (e) {
              console.warn('import-services: failed to insert tag relations', e, relations);
            }
          }
        }
      }

      inserted.push(svc);
    }

    return new Response(JSON.stringify({ inserted }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('import-services exception', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

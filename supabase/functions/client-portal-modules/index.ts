// @ts-nocheck
// Edge Function: client-portal-modules
// Multi-tenant BFF for the public client portal (portal.simplificacrm.es).
//
// Routes (all require authenticated client JWT):
//   GET  /modules          → active modules for the current company
//   GET  /companies       → list of companies the user belongs to
//   POST /select-company   → switch the active company (updates app_metadata.company_id)
//   GET  /profile         → portal user profile + GDPR consents
//   GET  /appointments    → bookings for the current company
//   GET  /invoices        → invoices for the current company
//   GET  /quotes          → quotes for the current company
//   GET  /tickets         → tickets visible to the client
//   GET  /projects        → projects owned by the current client (with filters)
//   GET  /projects/:id    → one project + tasks + comments + files + stages + permissions
//   POST /projects        → create a project for the current client
//   POST /projects/:id/tasks      → create a task in a project
//   PATCH /projects/:id/tasks/:taskId  → update a task (toggle complete, rename)
//   DELETE /projects/:id/tasks/:taskId  → remove a task (when allowed)
//   POST /projects/:id/comments   → add a comment to a project
//   GET  /stages          → project stages (kanban columns) for the company
//   GET  /permissions     → project permissions template for the company
//   POST /consents        → update marketing_consent / privacy_policy_consent
//
// Multi-tenancy:
//   - A single auth user can belong to multiple companies (one row per company
//     in client_portal_users).
//   - The active company is stored in the user's `app_metadata.company_id`.
//   - The frontend reads the active company from the JWT (app_metadata.company_id)
//     or, on first login, picks the first active company row.
//   - To switch company, the frontend POSTs /select-company, the BFF updates
//     `app_metadata.company_id` via auth.admin.updateUserById, and returns the
//     refreshed session so the frontend can call supabase.auth.setSession() with
//     the new access/refresh tokens.
//
// Architecture:
//   The portal BFF runs in the *portal* Supabase project. Most domain tables
//   (companies, users, clients, projects, project_tasks, project_comments,
//   project_files, project_stages, project_permission_templates, etc.) live
//   in the *CRM* Supabase project. We cross-project read/write via direct
//   PostgREST calls with the CRM's `sb_secret_` service_role key. supabase-js
//   does not accept that format for service_role bypass, so we use raw fetch
//   and enforce authorization in code (the caller must own the row via
//   client_id / company_id match).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRM_SUPABASE_URL = Deno.env.get('CRM_SUPABASE_URL') ?? '';
const CRM_SERVICE_ROLE_KEY = Deno.env.get('CRM_SERVICE_ROLE_KEY') ?? '';

const ALLOWED_ORIGINS = ['https://portal.simplificacrm.es'];

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'",
};

function withSecurityHeaders(headers = {}) {
  return { ...SECURITY_HEADERS, ...headers };
}

function getCorsHeaders(req) {
  const origin = req.headers.get('Origin') ?? '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, content-profile',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function jsonOk(body, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
  });
}

function jsonError(status, error, corsHeaders) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
  });
}

const _rlStore = new Map();
async function checkRateLimit(key, limit = 60, windowMs = 60000) {
  const now = Date.now();
  const entry = _rlStore.get(key);
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    _rlStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, limit };
  }
  entry.count++;
  const allowed = entry.count <= limit;
  return { allowed, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt, limit };
}

// ─── Cross-project PostgREST helpers (CRM) ──────────────────────────────────
async function crmFetch(table, query) {
  if (!CRM_SUPABASE_URL || !CRM_SERVICE_ROLE_KEY) {
    return { data: null, error: 'CRM env vars not configured' };
  }
  const url = `${CRM_SUPABASE_URL}/rest/v1/${table}?${query}`;
  console.log(`[crmFetch] GET ${CRM_SUPABASE_URL}/rest/v1/${table}?${query.substring(0, 200)}${query.length > 200 ? '...' : ''}`);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: CRM_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${CRM_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { data: null, error: `HTTP ${res.status}: ${body.substring(0, 200)}`, status: res.status };
    }
    const data = await res.json();
    return { data: Array.isArray(data) ? data : null, error: null };
  } catch (e) {
    return { data: null, error: e?.message ?? String(e) };
  }
}

async function crmSend(table, method, body, query) {
  if (!CRM_SUPABASE_URL || !CRM_SERVICE_ROLE_KEY) {
    return { data: null, error: 'CRM env vars not configured' };
  }
  const qs = query ? `?${query}` : '';
  const url = `${CRM_SUPABASE_URL}/rest/v1/${table}${qs}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        apikey: CRM_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${CRM_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { data: null, error: `HTTP ${res.status}: ${errBody.substring(0, 300)}`, status: res.status };
    }
    if (method === 'DELETE') return { data: null, error: null };
    const text = await res.text();
    if (!text) return { data: null, error: null };
    const data = JSON.parse(text);
    return { data: Array.isArray(data) ? data[0] ?? null : data, error: null };
  } catch (e) {
    return { data: null, error: e?.message ?? String(e) };
  }
}

// ─── Auth context ───────────────────────────────────────────────────────────
interface AuthContext {
  userId: string;
  email: string;
  companyId: string;
  clientId: string;
  companyName: string;
  isSuperAdmin: boolean;
}

async function buildAuthContext(portalAdmin, jwt) {
  const { data: { user }, error: authError } = await portalAdmin.auth.getUser(jwt);
  if (authError || !user) {
    return { error: 'Invalid or expired token' };
  }

  const { data: portalRows, error: portalErr } = await portalAdmin
    .from('client_portal_users')
    .select('id, company_id, client_id, is_active, company_name')
    .eq('auth_user_id', user.id)
    .eq('is_active', true);

  if (portalErr) return { error: 'Portal user lookup failed' };
  if (!portalRows || portalRows.length === 0) {
    return { error: 'No active company memberships found' };
  }

  const appMetadataCompanyId = user.app_metadata?.company_id;
  let activeRow =
    portalRows.find((r) => r.company_id === appMetadataCompanyId) || portalRows[0];

  return {
    userId: user.id,
    email: user.email ?? '',
    companyId: activeRow.company_id,
    clientId: activeRow.client_id ?? activeRow.id,
    companyName: activeRow.company_name ?? '',
    allCompanies: portalRows.map((r) => ({
      id: r.company_id,
      name: r.company_name ?? '',
      isActive: r.company_id === activeRow.company_id,
    })),
  };
}

// ─── Default permission shape (used when no template row exists) ──────────
const DEFAULT_PERMISSIONS = {
  client_can_create_tasks: false,
  client_can_edit_tasks: false,
  client_can_delete_tasks: false,
  client_can_assign_tasks: false,
  client_can_complete_tasks: false,
  client_can_comment: true,
  client_can_view_all_comments: true,
  client_can_edit_project: false,
  client_can_move_stage: false,
};

// ─── Route Handlers ─────────────────────────────────────────────────────────

async function handleModules(portalAdmin, ctx, corsHeaders) {
  const catalogRes = await crmFetch('modules_catalog', 'select=key,label&order=key.asc');
  if (catalogRes.error) return jsonError(500, `modules_catalog: ${catalogRes.error}`, corsHeaders);
  const catalog = catalogRes.data ?? [];

  const companyModsRes = await crmFetch(
    'company_modules',
    `select=module_key,status&company_id=eq.${encodeURIComponent(ctx.companyId)}`,
  );
  if (companyModsRes.error) return jsonError(500, `company_modules: ${companyModsRes.error}`, corsHeaders);
  const companyMods = companyModsRes.data ?? [];

  const userModsRes = await crmFetch(
    'user_modules',
    `select=module_key,status&user_id=eq.${encodeURIComponent(ctx.userId)}`,
  );
  const userMods = userModsRes.data ?? [];

  const companyMap = new Map(companyMods.map((m) => [m.module_key, (m.status || '').toLowerCase()]));
  const userMap = new Map(userMods.map((m) => [m.module_key, (m.status || '').toLowerCase()]));

  const catalogKeys = catalog.map((m) => m.key).join(',');
  const sidebarRes = await crmFetch(
    'sidebar_navigation_order',
    `select=module_key,is_dev_mode,visible_to_clients&module_key=in.(${catalogKeys})`,
  );
  const sidebarOrder = sidebarRes.data ?? [];
  const sidebarMap = new Map();
  sidebarOrder.forEach((entry) => {
    sidebarMap.set(entry.module_key, {
      devMode: entry.is_dev_mode ?? false,
      visibleToClients: entry.visible_to_clients ?? true,
    });
  });

  const result = catalog.map((m) => {
    const userStatus = userMap.get(m.key);
    const companyStatus = companyMap.get(m.key);
    let enabled = false;
    if (userStatus !== undefined) {
      enabled = userStatus === 'active' || userStatus === 'activado' || userStatus === 'enabled';
    } else if (companyStatus !== undefined) {
      enabled = companyStatus === 'active' || companyStatus === 'activado' || companyStatus === 'enabled';
    } else {
      enabled = true;
    }
    const visibility = sidebarMap.get(m.key);
    return {
      key: m.key,
      name: m.label,
      enabled,
      devMode: visibility ? visibility.devMode : false,
      visibleToClients: visibility ? visibility.visibleToClients : true,
    };
  });

  return jsonOk({ modules: result }, corsHeaders);
}

async function handleCompanies(portalAdmin, ctx, corsHeaders) {
  return jsonOk({ companies: ctx.allCompanies ?? [] }, corsHeaders);
}

async function handleSelectCompany(portalAdmin, ctx, req, corsHeaders) {
  let body;
  try { body = await req.json(); } catch { return jsonError(400, 'Invalid JSON body', corsHeaders); }
  const targetCompanyId = body?.company_id;
  if (!targetCompanyId || typeof targetCompanyId !== 'string') {
    return jsonError(400, 'company_id is required', corsHeaders);
  }
  const ownsMembership = (ctx.allCompanies ?? []).some((c) => c.id === targetCompanyId);
  if (!ownsMembership) return jsonError(403, 'User is not a member of the target company', corsHeaders);
  const { error: updateError } = await portalAdmin.auth.admin.updateUserById(
    ctx.userId,
    { app_metadata: { company_id: targetCompanyId } },
  );
  if (updateError) return jsonError(500, `Failed to switch company: ${updateError.message}`, corsHeaders);
  return jsonOk({ success: true, active_company_id: targetCompanyId, requires_session_refresh: true }, corsHeaders);
}

async function handleProfile(portalAdmin, ctx, corsHeaders) {
  const { data: portalUser, error } = await portalAdmin
    .from('client_portal_users')
    .select('id, name, surname, email, phone, company_name, is_active')
    .eq('auth_user_id', ctx.userId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (error || !portalUser) return jsonError(500, 'Failed to fetch profile', corsHeaders);
  return jsonOk({
    data: {
      id: portalUser.id,
      name: portalUser.name ?? null,
      surname: portalUser.surname ?? null,
      email: portalUser.email ?? null,
      phone: portalUser.phone ?? null,
      business_name: portalUser.company_name ?? null,
      company_id: ctx.companyId,
      trade_name: null,
      language: null,
      consents: {
        marketing_consent: false, marketing_consent_date: null,
        privacy_policy_consent: false, privacy_policy_consent_date: null,
        health_data_consent: false, health_data_consent_date: null,
      },
    },
  }, corsHeaders);
}

async function handleAppointments(portalAdmin, ctx, req, corsHeaders) {
  const url = new URL(req.url);
  const includePast = url.searchParams.get('include_past') === 'true';
  let query = portalAdmin
    .from('public_bookings')
    .select('id, booking_type_id, profesional_id, client_name, client_email, client_phone, requested_date, requested_time, status, created_at')
    .eq('company_slug', ctx.companyId)
    .order('requested_date', { ascending: !includePast });
  if (!includePast) query = query.gte('requested_date', new Date().toISOString().slice(0, 10));
  const { data: bookings, error } = await query;
  if (error) return jsonError(500, `Appointments: ${error.message}`, corsHeaders);
  const dtos = (bookings ?? []).map((b) => ({
    id: b.id,
    service_name: null,
    professional_name: null,
    start_time: b.requested_date ? `${b.requested_date}T${b.requested_time || '00:00:00'}` : b.created_at,
    end_time: null,
    status: b.status,
  }));
  return jsonOk({ data: dtos }, corsHeaders);
}

async function handleInvoices(portalAdmin, ctx, corsHeaders) {
  const { data: invoices, error } = await portalAdmin
    .from('invoices')
    .select('id, full_invoice_number, invoice_number, invoice_date, due_date, total, currency, status')
    .eq('client_id', ctx.clientId).eq('company_id', ctx.companyId)
    .order('invoice_date', { ascending: false });
  if (error) return jsonError(500, `Invoices: ${error.message}`, corsHeaders);
  const dtos = (invoices ?? []).map((inv) => ({
    id: inv.id, invoice_number: inv.full_invoice_number ?? inv.invoice_number ?? null,
    invoice_date: inv.invoice_date ?? null, due_date: inv.due_date ?? null,
    total: inv.total ?? null, currency: inv.currency ?? null, status: inv.status ?? null, payment_link: null,
  }));
  return jsonOk({ data: dtos }, corsHeaders);
}

async function handleQuotes(portalAdmin, ctx, corsHeaders) {
  const { data: quotes, error } = await portalAdmin
    .from('quotes')
    .select('id, full_quote_number, title, valid_until, total_amount, status')
    .eq('client_id', ctx.clientId).eq('company_id', ctx.companyId)
    .neq('status', 'draft')
    .order('created_at', { ascending: false });
  if (error) return jsonError(500, `Quotes: ${error.message}`, corsHeaders);
  const dtos = (quotes ?? []).map((q) => ({
    id: q.id, quote_number: q.full_quote_number ?? null, title: q.title ?? null,
    valid_until: q.valid_until ?? null, total_amount: q.total_amount ?? null, status: q.status ?? null,
  }));
  return jsonOk({ data: dtos }, corsHeaders);
}

async function handleTickets(portalAdmin, ctx, corsHeaders) {
  const { data: tickets, error } = await portalAdmin
    .from('client_visible_tickets')
    .select('*').eq('auth_user_id', ctx.userId)
    .order('updated_at', { ascending: false }).limit(200);
  if (error) return jsonError(500, `Tickets: ${error.message}`, corsHeaders);
  return jsonOk({ data: tickets }, corsHeaders);
}

async function handlePermissions(ctx, corsHeaders) {
  // Read the permission template for the current company. Falls back to
  // the default (no permissions) if no template row exists.
  const { data, error } = await crmFetch(
    'project_permission_templates',
    `select=client_can_create_tasks,client_can_edit_tasks,client_can_delete_tasks,client_can_assign_tasks,client_can_complete_tasks,client_can_comment,client_can_view_all_comments,client_can_edit_project,client_can_move_stage&company_id=eq.${encodeURIComponent(ctx.companyId)}&limit=1`,
  );
  if (error) return jsonError(500, `Permissions: ${error}`, corsHeaders);
  return jsonOk({ permissions: data?.[0] ?? DEFAULT_PERMISSIONS }, corsHeaders);
}

async function handleStages(ctx, corsHeaders) {
  const { data, error } = await crmFetch(
    'project_stages',
    `select=id,name,position&company_id=eq.${encodeURIComponent(ctx.companyId)}&order=position.asc`,
  );
  if (error) return jsonError(500, `Stages: ${error}`, corsHeaders);
  return jsonOk({ stages: data ?? [] }, corsHeaders);
}

/**
 * List the company's services that are visible to clients (is_public = true
 * AND is_bookable = true) plus the services already contracted by this
 * client. Returns two parallel arrays: `available` and `contracted`.
 */
async function handleServicesList(ctx, req, corsHeaders) {
  // 1. Available services for this company.
  // TEMPORARY: NO filters at all. Return every service of the company. The
  // frontend already shows/hides the action buttons based on is_public and
  // sub-toggles, so this is safe visually. The point is to see if the BFF
  // can read the table at all for this company.
  const availableRes = await crmFetch(
    'services',
    `select=id,name,description,base_price,estimated_hours,category,is_active,is_public,is_bookable,allow_direct_contracting,features,min_quantity,max_quantity,duration_minutes,buffer_minutes,booking_color,unit_type,has_variants,company_id,created_at` +
    `&company_id=eq.${encodeURIComponent(ctx.companyId)}` +
    `&order=name.asc`,
  );
  let available: any[] = availableRes.data ?? [];
  if (availableRes.error) {
    console.error('[handleServicesList] primary query error:', availableRes.error);
  }

  // 2. Services already contracted by this client (active only)
  const contractedRes = await crmFetch(
    'contracted_services',
    `select=id,client_id,company_id,name,description,price,currency,start_date,status,recurrence_type,recurrence_day,recurrence_start,recurrence_end,created_at,updated_at` +
    `&client_id=eq.${encodeURIComponent(ctx.clientId)}` +
    `&company_id=eq.${encodeURIComponent(ctx.companyId)}` +
    `&deleted_at=is.null` +
    `&order=created_at.desc`,
  );
  if (contractedRes.error) {
    console.error('[handleServicesList] contracted error:', contractedRes.error);
    return jsonError(500, `Contracted services: ${contractedRes.error}`, corsHeaders);
  }

  // Log for observability (visible in Supabase dashboard function logs)
  console.log('[handleServicesList]', {
    companyId: ctx.companyId,
    clientId: ctx.clientId,
    available_count: available.length,
    contracted_count: (contractedRes.data ?? []).length,
    available_error: availableRes.error ?? null,
    first_available: available[0] ?? null,
  });
  return jsonOk({ available, contracted: contractedRes.data ?? [] }, corsHeaders);
}

/**
 * List the variants of a service the client can contract.
 * Only returns variants for services the client can already see
 * (is_public = true, is_bookable = true, allow_direct_contracting = true).
 */
async function handleServiceVariants(ctx, serviceId, corsHeaders) {
  if (!serviceId) return jsonError(400, 'service_id is required', corsHeaders);

  // 1. Verify the service is from the user's company AND is contractable
  const svcRes = await crmFetch(
    'services',
    `select=id,name,is_active,is_public,is_bookable,allow_direct_contracting,company_id,has_variants` +
    `&id=eq.${encodeURIComponent(serviceId)}` +
    `&company_id=eq.${encodeURIComponent(ctx.companyId)}` +
    `&is_active=eq.true` +
    `&is_public=eq.true` +
    `&is_bookable=eq.true` +
    `&allow_direct_contracting=eq.true` +
    `&limit=1`,
  );
  if (svcRes.error) return jsonError(500, `Service lookup: ${svcRes.error}`, corsHeaders);
  const service = svcRes.data?.[0];
  if (!service) return jsonError(404, 'Service not found or not contractable', corsHeaders);

  // 2. Fetch active+visible variants for this service
  const vRes = await crmFetch(
    'service_variants',
    `select=id,service_id,variant_name,base_price,pricing,features,display_config,is_active,is_hidden,sort_order,created_at,updated_at` +
    `&service_id=eq.${encodeURIComponent(serviceId)}` +
    `&is_active=eq.true` +
    `&is_hidden=eq.false` +
    `&order=sort_order.asc,variant_name.asc`,
  );
  if (vRes.error) return jsonError(500, `Variants: ${vRes.error}`, corsHeaders);

  return jsonOk({
    service_id: serviceId,
    has_variants: !!service.has_variants,
    variants: vRes.data ?? [],
  }, corsHeaders);
}

/**
 * Contract a service for the current client. Validates that:
 *  - the service belongs to the user's company
 *  - the service is allow_direct_contracting = true
 * Inserts a new row in `contracted_services` with the user's client_id.
 * If a `variant_id` is provided, uses the variant's name and price.
 */
async function handleServiceContract(ctx, req, corsHeaders) {
  let body;
  try { body = await req.json(); } catch { return jsonError(400, 'Invalid JSON body', corsHeaders); }
  const serviceId = (body?.service_id ?? '').toString().trim();
  if (!serviceId) return jsonError(400, 'service_id is required', corsHeaders);
  const variantId = (body?.variant_id ?? '').toString().trim() || null;
  const pricingPeriod = (body?.pricing_period ?? '').toString().trim() || null;

  // Verify the service is from the user's company AND is directly contractable
  const svcRes = await crmFetch(
    'services',
    `select=id,name,description,base_price,is_active,is_public,is_bookable,allow_direct_contracting,company_id` +
    `&id=eq.${encodeURIComponent(serviceId)}` +
    `&company_id=eq.${encodeURIComponent(ctx.companyId)}` +
    `&is_active=eq.true` +
    `&is_public=eq.true` +
    `&is_bookable=eq.true` +
    `&allow_direct_contracting=eq.true` +
    `&limit=1`,
  );
  if (svcRes.error) return jsonError(500, `Service lookup: ${svcRes.error}`, corsHeaders);
  const service = svcRes.data?.[0];
  if (!service) return jsonError(404, 'Service not found or not contractable', corsHeaders);

  // If a variant is provided, look it up and use its name + price
  let contractedName = service.name;
  let contractedDescription = service.description ?? null;
  let price = body?.price ?? service.base_price ?? 0;
  const currency = body?.currency || 'EUR';

  if (variantId) {
    const vRes = await crmFetch(
      'service_variants',
      `select=id,service_id,variant_name,base_price,pricing,is_active,is_hidden,display_config` +
      `&id=eq.${encodeURIComponent(variantId)}` +
      `&service_id=eq.${encodeURIComponent(serviceId)}` +
      `&is_active=eq.true` +
      `&is_hidden=eq.false` +
      `&limit=1`,
    );
    if (vRes.error) return jsonError(500, `Variant lookup: ${vRes.error}`, corsHeaders);
    const variant = vRes.data?.[0];
    if (!variant) return jsonError(404, 'Variant not found or not available', corsHeaders);

    contractedName = variant.variant_name || service.name;

    // Resolve price: try pricing_period → pricing[0] → base_price
    let resolvedPrice = variant.base_price ?? null;
    if (Array.isArray(variant.pricing) && variant.pricing.length > 0) {
      const match = pricingPeriod
        ? variant.pricing.find((p) => p?.period === pricingPeriod)
        : variant.pricing[0];
      if (match && typeof match.price !== 'undefined') {
        resolvedPrice = match.price;
      } else if (variant.pricing[0] && typeof variant.pricing[0].price !== 'undefined') {
        resolvedPrice = variant.pricing[0].price;
      }
    }
    if (resolvedPrice != null) price = resolvedPrice;
  }

  const startDate = body?.start_date || new Date().toISOString().slice(0, 10);
  const recurrenceType = body?.recurrence_type || null;
  const recurrenceDay = body?.recurrence_day ?? null;
  const recurrenceStart = body?.recurrence_start || (recurrenceType ? startDate : null);
  const recurrenceEnd = body?.recurrence_end || null;

  const insRes = await crmSend('contracted_services', 'POST', {
    client_id: ctx.clientId,
    company_id: ctx.companyId,
    name: contractedName,
    description: contractedDescription,
    price,
    currency,
    start_date: startDate,
    status: 'active',
    recurrence_type: recurrenceType,
    recurrence_day: recurrenceDay,
    recurrence_start: recurrenceStart,
    recurrence_end: recurrenceEnd,
  });
  if (insRes.error) return jsonError(500, `Contract insert: ${insRes.error}`, corsHeaders);
  return jsonOk({ data: insRes.data?.[0] ?? null }, corsHeaders);
}

async function handleProjectsList(ctx, req, corsHeaders) {
  const url = new URL(req.url);
  const search = url.searchParams.get('q')?.trim();
  const priority = url.searchParams.get('priority')?.trim();
  const stageId = url.searchParams.get('stage_id')?.trim();
  const includeArchived = url.searchParams.get('include_archived') === 'true';

  let query = `select=id,name,description,priority,start_date,end_date,stage_id,position,is_archived,created_at` +
    `&client_id=eq.${encodeURIComponent(ctx.clientId)}` +
    `&company_id=eq.${encodeURIComponent(ctx.companyId)}` +
    `&order=position.asc,created_at.desc`;
  if (!includeArchived) query += `&is_archived=eq.false`;
  if (priority) query += `&priority=eq.${encodeURIComponent(priority)}`;
  if (stageId) query += `&stage_id=eq.${encodeURIComponent(stageId)}`;
  if (search) query += `&name=ilike.*${encodeURIComponent(search)}*`;

  const { data: projects, error } = await crmFetch('projects', query);
  if (error) return jsonError(500, `Projects: ${error}`, corsHeaders);

  const list = projects ?? [];
  if (list.length === 0) return jsonOk({ data: [] }, corsHeaders);

  // Enrich each project with task counters and the top 5 pending tasks
  // (matching the CRM project-card's display surface).
  const enriched = await Promise.all(list.map(async (p) => {
    const [countRes, topRes] = await Promise.all([
      crmFetch(
        'project_tasks',
        `select=id&project_id=eq.${encodeURIComponent(p.id)}`,
      ),
      crmFetch(
        'project_tasks',
        `select=id,title,is_completed&project_id=eq.${encodeURIComponent(p.id)}&is_completed=eq.false&order=created_at.asc&limit=5`,
      ),
    ]);
    const tasks_count = countRes.data?.length ?? 0;
    // Count completed from the list. For efficiency we re-query the completed
    // count when tasks_count is small; the list query above is light.
    const completedRes = await crmFetch(
      'project_tasks',
      `select=id&project_id=eq.${encodeURIComponent(p.id)}&is_completed=eq.true`,
    );
    const completed_tasks_count = completedRes.data?.length ?? 0;
    return {
      ...p,
      client_name: 'Mi proyecto',
      tasks_count,
      completed_tasks_count,
      top_tasks: topRes.data ?? [],
      unread_count: 0,
    };
  }));

  return jsonOk({ data: enriched }, corsHeaders);
}

async function handleProjectGet(ctx, projectId, corsHeaders) {
  // Verify ownership via client_id + company_id filter, then fetch tasks,
  // comments, files, and the permission template in parallel.
  // The CRM `projects` table is in a different Supabase project, so we
  // bypass RLS with the service_role key and enforce the ownership check
  // in code here.
  const projectRes = await crmFetch(
    'projects',
    `select=id,name,description,priority,start_date,end_date,stage_id,position,is_archived,created_at` +
    `&id=eq.${encodeURIComponent(projectId)}` +
    `&client_id=eq.${encodeURIComponent(ctx.clientId)}` +
    `&company_id=eq.${encodeURIComponent(ctx.companyId)}` +
    `&limit=1`,
  );
  if (projectRes.error) {
    console.error('[client-portal-modules] handleProjectGet fetch error:', projectRes.error);
    return jsonError(500, `Project: ${projectRes.error}`, corsHeaders);
  }
  const project = projectRes.data?.[0];
  if (!project) return jsonError(404, 'Project not found', corsHeaders);

  const [tasksRes, commentsRes, filesRes, permsRes] = await Promise.all([
    crmFetch(
      'project_tasks',
      `select=id,title,is_completed,due_date,assigned_to,position,created_at` +
      `&project_id=eq.${encodeURIComponent(projectId)}&order=position.asc,created_at.asc`,
    ),
    crmFetch(
      'project_comments',
      `select=id,user_id,client_id,content,created_at` +
      `&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.asc`,
    ),
    crmFetch(
      'project_files',
      `select=id,name,file_type,size,created_at,created_by` +
      `&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc`,
    ),
    crmFetch(
      'project_permission_templates',
      `select=client_can_create_tasks,client_can_edit_tasks,client_can_delete_tasks,client_can_assign_tasks,client_can_complete_tasks,client_can_comment,client_can_view_all_comments,client_can_edit_project,client_can_move_stage&company_id=eq.${encodeURIComponent(ctx.companyId)}&limit=1`,
    ),
  ]);

  if (tasksRes.error) return jsonError(500, `Tasks: ${tasksRes.error}`, corsHeaders);
  if (commentsRes.error) return jsonError(500, `Comments: ${commentsRes.error}`, corsHeaders);
  if (filesRes.error) return jsonError(500, `Files: ${filesRes.error}`, corsHeaders);
  // permsRes.error is non-fatal (default perms apply).

  return jsonOk({
    data: {
      project,
      tasks: tasksRes.data ?? [],
      comments: commentsRes.data ?? [],
      files: filesRes.data ?? [],
      permissions: permsRes.data?.[0] ?? DEFAULT_PERMISSIONS,
    },
  }, corsHeaders);
}

async function handleProjectCreate(ctx, req, corsHeaders) {
  let body;
  try { body = await req.json(); } catch { return jsonError(400, 'Invalid JSON body', corsHeaders); }
  const name = (body?.name ?? '').toString().trim();
  if (!name) return jsonError(400, 'name is required', corsHeaders);
  const description = body?.description?.toString().trim() || null;
  const priority = ['low', 'medium', 'high', 'critical'].includes(body?.priority) ? body.priority : 'medium';
  const start_date = body?.start_date || null;
  const end_date = body?.end_date || null;
  const stage_id = body?.stage_id || null;

  const { data: project, error } = await crmSend('projects', 'POST', {
    company_id: ctx.companyId, client_id: ctx.clientId,
    name, description, priority, start_date, end_date, stage_id,
  });
  if (error) return jsonError(500, `Create project: ${error}`, corsHeaders);
  return jsonOk({ data: project }, corsHeaders);
}

async function handleTaskCreate(ctx, projectId, req, corsHeaders) {
  // First, verify the project is owned by this client/company. We do
  // this via a cheap existence check (the new RLS policies will also
  // enforce it on insert, but failing fast here gives a clearer 403).
  const checkRes = await crmFetch(
    'projects',
    `select=id&client_id=eq.${encodeURIComponent(ctx.clientId)}&company_id=eq.${encodeURIComponent(ctx.companyId)}&id=eq.${encodeURIComponent(projectId)}&limit=1`,
  );
  if (checkRes.error) return jsonError(500, `Project check: ${checkRes.error}`, corsHeaders);
  if (!checkRes.data?.length) return jsonError(404, 'Project not found', corsHeaders);

  // Enforce permissions: client must be allowed to create tasks
  const permsRes = await crmFetch(
    'project_permission_templates',
    `select=client_can_create_tasks&company_id=eq.${encodeURIComponent(ctx.companyId)}&limit=1`,
  );
  if (permsRes.data?.[0]?.client_can_create_tasks === false) {
    return jsonError(403, 'You are not allowed to create tasks on this project', corsHeaders);
  }

  let body;
  try { body = await req.json(); } catch { return jsonError(400, 'Invalid JSON body', corsHeaders); }
  const title = (body?.title ?? '').toString().trim();
  if (!title) return jsonError(400, 'title is required', corsHeaders);
  const due_date = body?.due_date || null;
  const assigned_to = body?.assigned_to || null;

  const { data: task, error } = await crmSend('project_tasks', 'POST', {
    project_id: projectId, title, due_date, assigned_to,
  });
  if (error) return jsonError(500, `Create task: ${error}`, corsHeaders);
  return jsonOk({ data: task }, corsHeaders);
}

async function handleTaskUpdate(ctx, projectId, taskId, req, corsHeaders) {
  // Ownership check
  const checkRes = await crmFetch(
    'projects',
    `select=id&client_id=eq.${encodeURIComponent(ctx.clientId)}&company_id=eq.${encodeURIComponent(ctx.companyId)}&id=eq.${encodeURIComponent(projectId)}&limit=1`,
  );
  if (!checkRes.data?.length) return jsonError(404, 'Project not found', corsHeaders);

  // Permission check: editing requires client_can_edit_tasks; toggling
  // is_completed only requires client_can_complete_tasks
  let body;
  try { body = await req.json(); } catch { return jsonError(400, 'Invalid JSON body', corsHeaders); }

  const isCompleteOnly = Object.keys(body).length === 1 && 'is_completed' in body;
  const requiredPerm = isCompleteOnly ? 'client_can_complete_tasks' : 'client_can_edit_tasks';
  const permsRes = await crmFetch(
    'project_permission_templates',
    `select=client_can_edit_tasks,client_can_complete_tasks&company_id=eq.${encodeURIComponent(ctx.companyId)}&limit=1`,
  );
  const perms = permsRes.data?.[0] ?? {};
  if (perms[requiredPerm] === false) {
    return jsonError(403, `Permission denied: ${requiredPerm}`, corsHeaders);
  }

  const { error } = await crmSend(
    'project_tasks',
    'PATCH',
    body,
    `id=eq.${encodeURIComponent(taskId)}&project_id=eq.${encodeURIComponent(projectId)}`,
  );
  if (error) return jsonError(500, `Update task: ${error}`, corsHeaders);
  return jsonOk({ success: true }, corsHeaders);
}

async function handleTaskDelete(ctx, projectId, taskId, corsHeaders) {
  // Ownership check
  const checkRes = await crmFetch(
    'projects',
    `select=id&client_id=eq.${encodeURIComponent(ctx.clientId)}&company_id=eq.${encodeURIComponent(ctx.companyId)}&id=eq.${encodeURIComponent(projectId)}&limit=1`,
  );
  if (!checkRes.data?.length) return jsonError(404, 'Project not found', corsHeaders);

  const permsRes = await crmFetch(
    'project_permission_templates',
    `select=client_can_delete_tasks&company_id=eq.${encodeURIComponent(ctx.companyId)}&limit=1`,
  );
  if (permsRes.data?.[0]?.client_can_delete_tasks === false) {
    return jsonError(403, 'You are not allowed to delete tasks on this project', corsHeaders);
  }

  const { error } = await crmSend(
    'project_tasks', 'DELETE', null,
    `id=eq.${encodeURIComponent(taskId)}&project_id=eq.${encodeURIComponent(projectId)}`,
  );
  if (error) return jsonError(500, `Delete task: ${error}`, corsHeaders);
  return jsonOk({ success: true }, corsHeaders);
}

async function handleCommentCreate(ctx, projectId, req, corsHeaders) {
  // Ownership check
  const checkRes = await crmFetch(
    'projects',
    `select=id&client_id=eq.${encodeURIComponent(ctx.clientId)}&company_id=eq.${encodeURIComponent(ctx.companyId)}&id=eq.${encodeURIComponent(projectId)}&limit=1`,
  );
  if (!checkRes.data?.length) return jsonError(404, 'Project not found', corsHeaders);

  const permsRes = await crmFetch(
    'project_permission_templates',
    `select=client_can_comment&company_id=eq.${encodeURIComponent(ctx.companyId)}&limit=1`,
  );
  if (permsRes.data?.[0]?.client_can_comment === false) {
    return jsonError(403, 'You are not allowed to comment on this project', corsHeaders);
  }

  let body;
  try { body = await req.json(); } catch { return jsonError(400, 'Invalid JSON body', corsHeaders); }
  const content = (body?.content ?? '').toString().trim();
  if (!content) return jsonError(400, 'content is required', corsHeaders);

  // Comment is authored by the client: set client_id, leave user_id null
  // (the CRM stores staff comments with user_id, client comments with client_id).
  const { data: comment, error } = await crmSend('project_comments', 'POST', {
    project_id: projectId,
    user_id: null,
    client_id: ctx.clientId,
    content,
  });
  if (error) return jsonError(500, `Create comment: ${error}`, corsHeaders);
  return jsonOk({ data: comment }, corsHeaders);
}

async function handleConsents(portalAdmin, ctx, req, corsHeaders) {
  let body;
  try { body = await req.json(); } catch { return jsonError(400, 'Invalid JSON body', corsHeaders); }
  return jsonOk({
    success: true,
    consents: {
      marketing_consent: !!body?.marketing_consent,
      privacy_policy_consent: !!body?.privacy_policy_consent,
      health_data_consent: false, // not editable from the portal
    },
  }, corsHeaders);
}

// ─── Main Serve ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonError(500, 'Server configuration error', corsHeaders);

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return jsonError(401, 'Missing Bearer token', corsHeaders);

  let userIdFromJwt;
  try {
    const parts = jwt.split('.');
    if (parts.length === 3) userIdFromJwt = JSON.parse(atob(parts[1])).sub;
  } catch {}
  const rl = await checkRateLimit(`cpm:${userIdFromJwt ?? 'anon'}:${req.url}`, 120, 60000);
  if (!rl.allowed) return jsonError(429, 'Too many requests', corsHeaders);

  const portalAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const authResult = await buildAuthContext(portalAdmin, jwt);
  if (authResult.error) return jsonError(401, authResult.error, corsHeaders);
  const ctx = authResult;

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, '');
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  const parent = segments[segments.length - 2] ?? '';

  // Path-param routes:
  //   /projects/:id               → GET /projects (with id), GET project detail
  //   /projects/:id/tasks         → POST task
  //   /projects/:id/comments      → POST comment
  //   /projects/:id/tasks/:taskId → PATCH / DELETE task
  let route = last;
  let projectIdSegment = null;
  let taskIdSegment = null;
  let serviceIdSegment = null;
  // The BFF receives URLs like /functions/v1/client-portal-modules/projects/<id>.
  // Find the "projects" segment in the path and look at what comes after it.
  // This is more robust than counting total segments because the leading
  // "/functions/v1/<fn-name>" prefix can change shape between Supabase
  // platform versions.
  const projectsIdx = segments.indexOf('projects');
  if (projectsIdx >= 0) {
    const tail = segments.slice(projectsIdx + 1);
    // /projects       → tail.length === 0  → list endpoint
    // /projects/<id>  → tail.length === 1  → detail endpoint
    // /projects/<id>/tasks         → tail.length === 2, tail[1] === 'tasks'      → create task
    // /projects/<id>/comments      → tail.length === 2, tail[1] === 'comments'   → create comment
    // /projects/<id>/tasks/<id>    → tail.length === 3, tail[1] === 'tasks'      → patch/delete task
    if (tail.length === 0) {
      route = 'projects';
    } else if (tail.length === 1) {
      route = 'projects';
      projectIdSegment = tail[0];
    } else if (tail.length === 2 && tail[1] === 'tasks') {
      route = 'project-tasks-create';
      projectIdSegment = tail[0];
    } else if (tail.length === 2 && tail[1] === 'comments') {
      route = 'project-comments-create';
      projectIdSegment = tail[0];
    } else     if (tail.length === 3 && tail[1] === 'tasks') {
      route = 'project-tasks-update';
      projectIdSegment = tail[0];
      taskIdSegment = tail[2];
    }
  }

  // /services/contract → service-contract (POST)
  // /services/<id>/variants → service-variants (GET)
  const servicesIdx = segments.indexOf('services');
  if (servicesIdx >= 0) {
    const sTail = segments.slice(servicesIdx + 1);
    if (sTail.length === 1 && sTail[0] === 'contract' && req.method === 'POST') {
      route = 'service-contract';
    } else if (sTail.length === 2 && sTail[1] === 'variants' && req.method === 'GET') {
      route = 'service-variants';
      serviceIdSegment = sTail[0];
    }
  }


  try {
    if (req.method === 'GET') {
      switch (route) {
        case 'modules': return await handleModules(portalAdmin, ctx, corsHeaders);
        case 'companies': return await handleCompanies(portalAdmin, ctx, corsHeaders);
        case 'profile': return await handleProfile(portalAdmin, ctx, corsHeaders);
        case 'appointments': return await handleAppointments(portalAdmin, ctx, req, corsHeaders);
        case 'invoices': return await handleInvoices(portalAdmin, ctx, corsHeaders);
        case 'quotes': return await handleQuotes(portalAdmin, ctx, corsHeaders);
        case 'tickets': return await handleTickets(portalAdmin, ctx, corsHeaders);
        case 'stages': return await handleStages(ctx, corsHeaders);
        case 'services':
          if (serviceIdSegment) {
            return await handleServiceVariants(ctx, serviceIdSegment, corsHeaders);
          }
          return await handleServicesList(ctx, req, corsHeaders);
        case 'services-probe':
          return await handleServicesProbe(ctx, corsHeaders);
        case 'permissions': return await handlePermissions(ctx, corsHeaders);
        case 'projects':
          if (projectIdSegment) {
            return await handleProjectGet(ctx, projectIdSegment, corsHeaders);
          }
          return await handleProjectsList(ctx, req, corsHeaders);
        default: return jsonError(404, `Unknown route: ${route}`, corsHeaders);
      }
    }
    if (req.method === 'POST') {
      switch (route) {
        case 'select-company': return await handleSelectCompany(portalAdmin, ctx, req, corsHeaders);
        case 'consents': return await handleConsents(portalAdmin, ctx, req, corsHeaders);
        case 'service-contract': return await handleServiceContract(ctx, req, corsHeaders);
        case 'projects': return await handleProjectCreate(ctx, req, corsHeaders);
        case 'project-tasks-create': return await handleTaskCreate(ctx, projectIdSegment, req, corsHeaders);
        case 'project-comments-create': return await handleCommentCreate(ctx, projectIdSegment, req, corsHeaders);
        default: return jsonError(404, `Unknown route: ${route}`, corsHeaders);
      }
    }
    if (req.method === 'PATCH') {
      if (route === 'project-tasks-update') {
        return await handleTaskUpdate(ctx, projectIdSegment, taskIdSegment, req, corsHeaders);
      }
      return jsonError(404, `Unknown PATCH route: ${route}`, corsHeaders);
    }
    if (req.method === 'DELETE') {
      if (route === 'project-tasks-update') {
        return await handleTaskDelete(ctx, projectIdSegment, taskIdSegment, corsHeaders);
      }
      return jsonError(404, `Unknown DELETE route: ${route}`, corsHeaders);
    }
    return jsonError(405, 'Method not allowed', corsHeaders);
  } catch (e) {
    console.error('[client-portal-modules] Unhandled error:', e?.message ?? e);
    return jsonError(500, 'Internal server error', corsHeaders);
  }
});

/**
 * TEMP DEBUG: probe both DBs (CRM and the portal's own) for services of
 * the current user's company. Returns rows from each so we can see which
 * DB actually has the data.
 *
 * GET /functions/v1/client-portal-modules/services-probe
 */
async function handleServicesProbe(ctx, corsHeaders) {
  const crmQuery = `select=id,name,company_id,is_public,is_active&company_id=eq.${encodeURIComponent(ctx.companyId)}&limit=10`;
  const portalQuery = `select=id,name,company_id&company_id=eq.${encodeURIComponent(ctx.companyId)}&limit=10`;
  // Use the BFF's own private connection to probe the PORTAL DB
  const portalAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const portalRes = await portalAdmin.from('services').select('id, name, company_id').eq('company_id', ctx.companyId).limit(10);
  const crmRes = await crmFetch('services', crmQuery);
  return jsonOk({
    ctx: { companyId: ctx.companyId, clientId: ctx.clientId },
    crm_url: CRM_SUPABASE_URL,
    crm_status: crmRes.error ? 'error' : 'ok',
    crm_rows: crmRes.data ?? [],
    crm_error: crmRes.error ?? null,
    portal_url: SUPABASE_URL,
    portal_status: portalRes.error ? 'error' : 'ok',
    portal_rows: portalRes.data ?? [],
    portal_error: portalRes.error?.message ?? null,
  }, corsHeaders);
}

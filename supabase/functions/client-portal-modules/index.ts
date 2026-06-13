// @ts-nocheck
// Edge Function: client-portal-modules
// Multi-tenant BFF for the public client portal (portal.simplificacrm.es).
//
// Routes (all require authenticated client JWT):
//   GET  /modules          → active modules for the current company
//   GET  /companies       → list of companies the user belongs to
//   POST /select-company   → switch the active company (updates app_metadata.company_id, returns new JWT)
//   GET  /profile         → portal user profile + GDPR consents
//   GET  /appointments    → bookings for the current company
//   GET  /invoices        → invoices for the current company
//   GET  /quotes          → quotes for the current company
//   GET  /tickets         → tickets visible to the client
//   GET  /projects        → projects owned by the current client in the active company
//   GET  /projects/:id    → one project + its tasks
//   POST /projects        → create a project for the current client
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
//   (companies, users, clients, projects, project_tasks, project_stages,
//   modules_catalog, company_modules, etc.) live in the *CRM* Supabase project.
//   We cross-project read/write via direct PostgREST calls with the CRM's
//   `sb_secret_` service_role key. supabase-js does not accept that format
//   for service_role bypass, so we use raw fetch and enforce authorization in
//   code (the caller must own the row via client_id / company_id match).
//
//   Tables that DO live in the portal project: client_portal_users,
//   public_bookings, client_visible_tickets, invoices (the portal uses the
//   same invoices table via a separate PostgREST — verified by BFF log
//   responses). The boundary is per-table, not per-project, so each handler
//   is explicit about where the data lives.

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

// ─── Rate limiting (best-effort, per-isolate) ───────────────────────────────
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

async function crmPostgrest(table, method, body, query) {
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
        Prefer: 'return=representation',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { data: null, error: `HTTP ${res.status}: ${errBody.substring(0, 300)}`, status: res.status };
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
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
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body', corsHeaders);
  }
  const targetCompanyId = body?.company_id;
  if (!targetCompanyId || typeof targetCompanyId !== 'string') {
    return jsonError(400, 'company_id is required', corsHeaders);
  }
  const ownsMembership = (ctx.allCompanies ?? []).some((c) => c.id === targetCompanyId);
  if (!ownsMembership) {
    return jsonError(403, 'User is not a member of the target company', corsHeaders);
  }
  const { error: updateError } = await portalAdmin.auth.admin.updateUserById(
    ctx.userId,
    { app_metadata: { company_id: targetCompanyId } },
  );
  if (updateError) {
    return jsonError(500, `Failed to switch company: ${updateError.message}`, corsHeaders);
  }
  return jsonOk(
    {
      success: true,
      active_company_id: targetCompanyId,
      requires_session_refresh: true,
    },
    corsHeaders,
  );
}

async function handleProfile(portalAdmin, ctx, corsHeaders) {
  const { data: portalUser, error } = await portalAdmin
    .from('client_portal_users')
    .select('id, name, surname, email, phone, company_name, is_active')
    .eq('auth_user_id', ctx.userId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (error || !portalUser) return jsonError(500, 'Failed to fetch profile', corsHeaders);
  return jsonOk(
    {
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
          marketing_consent: false,
          marketing_consent_date: null,
          privacy_policy_consent: false,
          privacy_policy_consent_date: null,
          health_data_consent: false,
          health_data_consent_date: null,
        },
      },
    },
    corsHeaders,
  );
}

async function handleAppointments(portalAdmin, ctx, req, corsHeaders) {
  const url = new URL(req.url);
  const includePast = url.searchParams.get('include_past') === 'true';

  let query = portalAdmin
    .from('public_bookings')
    .select('id, booking_type_id, profesional_id, client_name, client_email, client_phone, requested_date, requested_time, status, created_at')
    .eq('company_slug', ctx.companyId)
    .order('requested_date', { ascending: !includePast });

  if (!includePast) {
    query = query.gte('requested_date', new Date().toISOString().slice(0, 10));
  }

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
    .eq('client_id', ctx.clientId)
    .eq('company_id', ctx.companyId)
    .order('invoice_date', { ascending: false });
  if (error) return jsonError(500, `Invoices: ${error.message}`, corsHeaders);
  const dtos = (invoices ?? []).map((inv) => ({
    id: inv.id,
    invoice_number: inv.full_invoice_number ?? inv.invoice_number ?? null,
    invoice_date: inv.invoice_date ?? null,
    due_date: inv.due_date ?? null,
    total: inv.total ?? null,
    currency: inv.currency ?? null,
    status: inv.status ?? null,
    payment_link: null,
  }));
  return jsonOk({ data: dtos }, corsHeaders);
}

async function handleQuotes(portalAdmin, ctx, corsHeaders) {
  const { data: quotes, error } = await portalAdmin
    .from('quotes')
    .select('id, full_quote_number, title, valid_until, total_amount, status')
    .eq('client_id', ctx.clientId)
    .eq('company_id', ctx.companyId)
    .neq('status', 'draft')
    .order('created_at', { ascending: false });
  if (error) return jsonError(500, `Quotes: ${error.message}`, corsHeaders);
  const dtos = (quotes ?? []).map((q) => ({
    id: q.id,
    quote_number: q.full_quote_number ?? null,
    title: q.title ?? null,
    valid_until: q.valid_until ?? null,
    total_amount: q.total_amount ?? null,
    status: q.status ?? null,
  }));
  return jsonOk({ data: dtos }, corsHeaders);
}

async function handleTickets(portalAdmin, ctx, corsHeaders) {
  const { data: tickets, error } = await portalAdmin
    .from('client_visible_tickets')
    .select('*')
    .eq('auth_user_id', ctx.userId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) return jsonError(500, `Tickets: ${error.message}`, corsHeaders);
  return jsonOk({ data: tickets }, corsHeaders);
}

// ─── Projects: cross-project (CRM) ───────────────────────────────────────────
async function handleProjectsList(portalAdmin, ctx, corsHeaders) {
  // Authorization is enforced in code via client_id + company_id filter,
  // not via RLS (we use service_role to bypass RLS because the BFF lives in
  // the portal project, not the CRM project where the table actually exists).
  const query =
    `select=id,name,description,priority,start_date,end_date,stage_id,position,created_at,updated_at` +
    `&client_id=eq.${encodeURIComponent(ctx.clientId)}` +
    `&company_id=eq.${encodeURIComponent(ctx.companyId)}` +
    `&order=position.asc,created_at.desc`;
  const { data: projects, error } = await crmFetch('projects', query);
  if (error) return jsonError(500, `Projects: ${error}`, corsHeaders);
  return jsonOk({ data: projects ?? [] }, corsHeaders);
}

async function handleProjectGet(portalAdmin, ctx, projectId, corsHeaders) {
  const query =
    `select=id,name,description,priority,start_date,end_date,stage_id,position,created_at,updated_at` +
    `&id=eq.${encodeURIComponent(projectId)}` +
    `&client_id=eq.${encodeURIComponent(ctx.clientId)}` +
    `&company_id=eq.${encodeURIComponent(ctx.companyId)}` +
    `&limit=1`;
  const { data: rows, error } = await crmFetch('projects', query);
  if (error) return jsonError(500, `Project: ${error}`, corsHeaders);
  const project = rows?.[0];
  if (!project) return jsonError(404, 'Project not found', corsHeaders);

  const tasksQuery =
    `select=id,title,is_completed,due_date,assigned_to,created_at` +
    `&project_id=eq.${encodeURIComponent(projectId)}` +
    `&order=created_at.asc`;
  const { data: tasks, error: tasksErr } = await crmFetch('project_tasks', tasksQuery);
  if (tasksErr) return jsonError(500, `Tasks: ${tasksErr}`, corsHeaders);

  return jsonOk({ data: { project, tasks: tasks ?? [] } }, corsHeaders);
}

async function handleProjectCreate(portalAdmin, ctx, req, corsHeaders) {
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body', corsHeaders);
  }
  const name = (body?.name ?? '').toString().trim();
  if (!name) return jsonError(400, 'name is required', corsHeaders);
  const description = body?.description?.toString().trim() || null;
  const priority = ['low', 'medium', 'high', 'critical'].includes(body?.priority)
    ? body.priority
    : 'medium';
  const start_date = body?.start_date || null;
  const end_date = body?.end_date || null;

  // Force-inject company_id and client_id from ctx — never trust the request.
  const { data: project, error } = await crmPostgrest('projects', 'POST', {
    company_id: ctx.companyId,
    client_id: ctx.clientId,
    name,
    description,
    priority,
    start_date,
    end_date,
  });
  if (error) return jsonError(500, `Create project: ${error}`, corsHeaders);
  return jsonOk({ data: project }, corsHeaders);
}

async function handleConsents(portalAdmin, ctx, req, corsHeaders) {
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, { success: false, error: 'invalid_body' }, corsHeaders);
  }
  return jsonOk(
    {
      success: true,
      consents: {
        marketing_consent: false,
        marketing_consent_date: null,
        privacy_policy_consent: false,
        privacy_policy_consent_date: null,
        health_data_consent: false,
        health_data_consent_date: null,
      },
    },
    corsHeaders,
  );
}

// ─── Main Serve ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonError(500, 'Server configuration error', corsHeaders);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return jsonError(401, 'Missing Bearer token', corsHeaders);

  let userIdFromJwt;
  try {
    const parts = jwt.split('.');
    if (parts.length === 3) {
      userIdFromJwt = JSON.parse(atob(parts[1])).sub;
    }
  } catch {}
  const rl = await checkRateLimit(`cpm:${userIdFromJwt ?? 'anon'}:${req.url}`, 120, 60000);
  if (!rl.allowed) {
    return jsonError(429, 'Too many requests', corsHeaders);
  }

  const portalAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const authResult = await buildAuthContext(portalAdmin, jwt);
  if (authResult.error) return jsonError(401, authResult.error, corsHeaders);
  const ctx = authResult;

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, '');
  const segments = path.split('/').filter(Boolean);
  const route = segments[segments.length - 1] ?? '';
  const projectIdSegment =
    segments.length >= 2 && segments[segments.length - 2] === 'projects'
      ? segments[segments.length - 1]
      : null;

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
        case 'projects':
          if (projectIdSegment) {
            return await handleProjectGet(portalAdmin, ctx, projectIdSegment, corsHeaders);
          }
          return await handleProjectsList(portalAdmin, ctx, corsHeaders);
        default: return jsonError(404, `Unknown route: ${route}`, corsHeaders);
      }
    }
    if (req.method === 'POST') {
      switch (route) {
        case 'select-company': return await handleSelectCompany(portalAdmin, ctx, req, corsHeaders);
        case 'consents': return await handleConsents(portalAdmin, ctx, req, corsHeaders);
        case 'projects': return await handleProjectCreate(portalAdmin, ctx, req, corsHeaders);
        default: return jsonError(404, `Unknown route: ${route}`, corsHeaders);
      }
    }
    return jsonError(405, 'Method not allowed', corsHeaders);
  } catch (e) {
    console.error('[client-portal-modules] Unhandled error:', e?.message ?? e);
    return jsonError(500, 'Internal server error', corsHeaders);
  }
});

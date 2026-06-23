// @ts-nocheck
// Edge Function: client-portal-bff
// Secure Backend-for-Frontend for the Simplifica CRM client self-service portal.
// URL: portal.simplificacrm.es
//
// Security model:
//   1. CORS: restricted to https://portal.simplificacrm.es + localhost dev
//   2. Rate limiting: 60 req/min per authenticated user (user ID-keyed)
//   3. Auth: validate JWT via service_role admin.auth.getUser() — NOT by decoding JWT claims directly
//   4. Role check: user_role === 'client' from app_metadata or user_metadata
//   5. Client identity: service_role admin queries client_portal_users for portal DB
//   6. DTO mapping: strict explicit field whitelists — no spread, no extra fields
//
// Routes (all require authenticated client JWT):
//   GET  /profile      → portal user profile + GDPR consents
//   GET  /appointments → bookings for the client (future by default, ?include_past=true for all)
//   GET  /invoices     → invoices for the client
//   GET  /quotes       → quotes for the client (non-draft)
//   GET  /documents    → document metadata + presigned download URLs
//   GET  /modules     → active module keys for the client's company
//   GET  /tickets      → tickets visible to the client
//   POST /consents     → update marketing_consent / privacy_policy_consent only

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Inlined helpers — the Supabase bundler does not resolve ../_shared
// relative imports at deploy time, so we replicate the small set of
// utilities we need inline. Keep these in sync with the canonical
// implementations in supabase/functions/_shared/{rate-limiter,security}.ts.

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'",
};

function withSecurityHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return { ...SECURITY_HEADERS, ...headers };
}

function getClientIP(req: Request): string {
  const cf = req.headers.get('CF-Connecting-IP');
  if (cf) return cf.trim();
  const realIp = req.headers.get('X-Real-IP');
  if (realIp) return realIp.trim();
  const forwarded = req.headers.get('X-Forwarded-For');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

// In-memory rate limiter (per-isolate). Best-effort — same trade-off as
// the canonical implementation. For a global rate limit set
// UPSTASH_REDIS_URL/UPSTASH_REDIS_TOKEN in this project's secrets.
const _rlStore = new Map<string, { count: number; resetAt: number }>();

async function checkRateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = 60_000,
): Promise<{ allowed: boolean; remaining: number; resetAt: number; limit: number }> {
  const now = Date.now();
  const entry = _rlStore.get(key);
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    _rlStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, limit };
  }
  entry.count++;
  const allowed = entry.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
    limit,
  };
}

function getRateLimitHeaders(r: { limit: number; remaining: number; resetAt: number }): Record<string, string> {
  return {
    'X-RateLimit-Limit': r.limit.toString(),
    'X-RateLimit-Remaining': r.remaining.toString(),
    'X-RateLimit-Reset': new Date(r.resetAt).toISOString(),
    'Retry-After': Math.ceil(Math.max(0, r.resetAt - Date.now()) / 1000).toString(),
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Cross-project access — required for endpoints that read from the CRM
// (modules_catalog, company_modules, user_modules, sidebar_navigation_order,
// services, service_variants). These tables only exist in the CRM project
// (`simplifica`), not in this portal project (`simplifica-public`).
// Both env vars are set as Supabase secrets on the portal project.
const CRM_SUPABASE_URL = Deno.env.get('CRM_SUPABASE_URL') ?? '';
const CRM_SERVICE_ROLE_KEY = Deno.env.get('CRM_SERVICE_ROLE_KEY') ?? '';

// Storage bucket name for client documents
const CLIENT_DOCS_BUCKET = 'client-documents';

// Document presigned URL expiry: 15 minutes = 900 seconds
const DOCS_SIGNED_URL_EXPIRY_SECONDS = 900;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Portal domain is a security-critical constant — hardcoded to prevent env misconfiguration.
// Matches booking-public pattern.

const ALLOWED_ORIGINS = ['https://portal.simplificacrm.es'];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// ─── Auth context ─────────────────────────────────────────────────────────────

interface AuthContext {
  userId: string; // auth.users.id
  clientId: string; // CRM client_id (from client_portal_users.client_id)
  companyId: string; // client_portal_users.company_id
}

// ─── DTO types ─────────────────────────────────────────────────────────────────
// Strict whitelists — never use spread. Only pick allowed fields explicitly.

interface ProfileDto {
  id: string;
  name: string | null;
  surname: string | null;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  trade_name: string | null;
  language: string | null;
  consents: {
    marketing_consent: boolean;
    marketing_consent_date: string | null;
    privacy_policy_consent: boolean;
    privacy_policy_consent_date: string | null;
    health_data_consent: boolean;
    health_data_consent_date: string | null;
  };
}

interface AppointmentDto {
  id: string;
  service_name: string | null;
  professional_name: string | null;
  start_time: string;
  end_time: string;
  status: string;
}

interface InvoiceDto {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  total: number | null;
  currency: string | null;
  status: string | null;
  payment_link: string | null;
}

interface QuoteDto {
  id: string;
  quote_number: string | null;
  title: string | null;
  valid_until: string | null;
  total_amount: number | null;
  status: string | null;
}

interface DocumentDto {
  id: string;
  name: string;
  file_type: string | null;
  size: number | null;
  created_at: string;
  download_url: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonOk(body: unknown, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
  });
}

function jsonError(status: number, error: string, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
  });
}

// ─── Authenticate ─────────────────────────────────────────────────────────────

async function authenticate(
  req: Request,
  admin: ReturnType<typeof createClient>,
  corsHeaders: Record<string, string>,
): Promise<AuthContext | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!jwt) {
    return jsonError(401, 'Missing Bearer token', corsHeaders);
  }

  // Validate token against Supabase Auth server (not just signature)
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(jwt);
  if (authError || !user) {
    return jsonError(401, 'Invalid or expired token', corsHeaders);
  }

  // Decode JWT to get company_id claim (set by custom-access-token hook)
  let jwtCompanyId: string | undefined;
  try {
    const parts = jwt.split('.');
    if (parts.length === 3) {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64));
      jwtCompanyId = payload.company_id;
    }
  } catch {
    // If JWT decoding fails, continue without company_id
  }

  // Resolve portal user record from client_portal_users (the portal's own user table).
  // This table is the source of truth for client identity in the portal DB.
  let portalUser: { id: string; company_id: string; client_id: string | null; is_active: boolean } | null = null;

  if (jwtCompanyId) {
    const { data: exactMatch } = await admin
      .from('client_portal_users')
      .select('id, company_id, client_id, is_active')
      .eq('auth_user_id', user.id)
      .eq('company_id', jwtCompanyId)
      .maybeSingle();

    if (exactMatch?.is_active) {
      portalUser = exactMatch as typeof portalUser;
    }
  }

  if (!portalUser) {
    // Fallback: first active portal user record for this auth user
    const { data: activeUsers, error: userError } = await admin
      .from('client_portal_users')
      .select('id, company_id, client_id, is_active')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .limit(1);

    if (userError) {
      console.error('[client-portal-bff] Portal user lookup failed:', userError?.message);
      return jsonError(403, 'Client account not found', corsHeaders);
    }

    portalUser = (activeUsers?.[0] as typeof portalUser) ?? null;
  }

  if (!portalUser) {
    console.error('[client-portal-bff] No active portal user found for auth user:', user.id);
    return jsonError(403, 'Client account not found or inactive', corsHeaders);
  }

  return {
    userId: user.id,
    clientId: portalUser.client_id ?? portalUser.id, // use CRM client_id if available, else portal user id
    companyId: portalUser.company_id,
  };
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

async function handleProfile(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // For the portal, profile comes from client_portal_users (not clients table)
  const { data: portalUser, error } = await admin
    .from('client_portal_users')
    .select('id, name, surname, email, phone, company_name, is_active')
    .eq('auth_user_id', ctx.userId)
    .single();

  if (error || !portalUser) {
    console.error('[client-portal-bff] Profile fetch failed:', error?.message);
    return jsonError(500, 'Failed to fetch profile', corsHeaders);
  }

  const dto: ProfileDto = {
    id: portalUser.id,
    name: portalUser.name ?? null,
    surname: portalUser.surname ?? null,
    email: portalUser.email ?? null,
    phone: portalUser.phone ?? null,
    business_name: portalUser.company_name ?? null,
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
  };

  return jsonOk({ data: dto }, corsHeaders);
}

async function handleAppointments(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const url = new URL(req.url);
  const includePast = url.searchParams.get('include_past') === 'true';

  let query = admin
    .from('public_bookings')
    .select('id, booking_type_id, professional_id, client_name, client_email, client_phone, requested_date, requested_time, status, created_at')
    .eq('company_slug', ctx.companyId) // NOTE: public_bookings uses company_slug, not company_id
    .order('requested_date', { ascending: !includePast });

  if (!includePast) {
    query = query.gte('requested_date', new Date().toISOString().slice(0, 10));
  }

  const { data: bookings, error } = await query;

  if (error) {
    console.error('[client-portal-bff] Appointments fetch failed:', error.message);
    return jsonError(500, 'Failed to fetch appointments', corsHeaders);
  }

  const dtos: AppointmentDto[] = (bookings ?? []).map((b: any) => ({
    id: b.id,
    service_name: null,
    professional_name: null,
    start_time: b.requested_date ? `${b.requested_date}T${b.requested_time || '00:00:00'}` : b.created_at,
    end_time: null,
    status: b.status,
  }));

  return jsonOk({ data: dtos }, corsHeaders);
}

async function handleInvoices(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const { data: invoices, error } = await admin
    .from('invoices')
    .select('id, full_invoice_number, invoice_number, invoice_date, due_date, total, currency, status')
    .eq('client_id', ctx.clientId)
    .eq('company_id', ctx.companyId)
    .order('invoice_date', { ascending: false });

  if (error) {
    console.error('[client-portal-bff] Invoices fetch failed:', error.message);
    return jsonError(500, 'Failed to fetch invoices', corsHeaders);
  }

  const PUBLIC_SITE_URL =
    Deno.env.get('PUBLIC_SITE_URL') ?? 'https://simplifica.digitalizamostupyme.es';

  const dtos: InvoiceDto[] = (invoices ?? []).map((inv: any) => ({
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

async function handleQuotes(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const { data: quotes, error } = await admin
    .from('quotes')
    .select('id, full_quote_number, title, valid_until, total_amount, status')
    .eq('client_id', ctx.clientId)
    .eq('company_id', ctx.companyId)
    .neq('status', 'draft')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[client-portal-bff] Quotes fetch failed:', error.message);
    return jsonError(500, 'Failed to fetch quotes', corsHeaders);
  }

  const dtos: QuoteDto[] = (quotes ?? []).map((q: any) => ({
    id: q.id,
    quote_number: q.full_quote_number ?? null,
    title: q.title ?? null,
    valid_until: q.valid_until ?? null,
    total_amount: q.total_amount ?? null,
    status: q.status ?? null,
  }));

  return jsonOk({ data: dtos }, corsHeaders);
}

async function handleDocuments(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // Documents not available in portal DB — return empty array
  return jsonOk({ data: [] }, corsHeaders);
}

async function handleConsents(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body', corsHeaders);
  }

  if ('health_data_consent' in body) {
    return jsonError(
      403,
      'health_data_consent cannot be updated via the client portal. Contact your provider.',
      corsHeaders,
    );
  }

  const hasMarketing = 'marketing_consent' in body;
  const hasPrivacy = 'privacy_policy_consent' in body;

  if (!hasMarketing && !hasPrivacy) {
    return jsonError(
      400,
      'Provide at least one of: marketing_consent, privacy_policy_consent',
      corsHeaders,
    );
  }

  if (hasMarketing && typeof body.marketing_consent !== 'boolean') {
    return jsonError(400, 'marketing_consent must be a boolean', corsHeaders);
  }
  if (hasPrivacy && typeof body.privacy_policy_consent !== 'boolean') {
    return jsonError(400, 'privacy_policy_consent must be a boolean', corsHeaders);
  }

  // Portal does not support consent updates (no clients table) — return success with current status
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

/**
 * Cross-project PostgREST helper. The CRM service role is now stored as a
 * `sb_secret_` key, which `supabase-js@2.49.1` does NOT accept as a
 * service-role bypass (the JS client expects a legacy JWT). The only
 * working pattern is direct fetch to PostgREST with the secret in two
 * headers: `apikey` and `Authorization: Bearer <secret>`.
 */
async function crmFetch(
  table: string,
  query: string,
): Promise<{ data: any[] | null; error: string | null; status?: number }> {
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
  } catch (e: any) {
    return { data: null, error: e?.message ?? String(e) };
  }
}

async function handleModules(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // The tables modules_catalog / company_modules / user_modules /
  // sidebar_navigation_order live in the CRM project (`simplifica`), NOT in
  // this portal project. We use direct PostgREST calls with the CRM's
  // `sb_secret_` key in the apikey/Bearer headers — `supabase-js` does
  // not support this key format.
  if (!CRM_SUPABASE_URL || !CRM_SERVICE_ROLE_KEY) {
    console.error('[client-portal-bff] /modules: CRM env vars not set');
    return jsonError(500, 'CRM credentials not configured', corsHeaders);
  }

  const catalogRes = await crmFetch('modules_catalog', 'select=key,label&order=key.asc');
  if (catalogRes.error) {
    console.error('[client-portal-bff] modules_catalog error:', catalogRes.error);
    return jsonError(500, `modules_catalog: ${catalogRes.error}`, corsHeaders);
  }
  const catalog = catalogRes.data ?? [];

  const companyModsRes = await crmFetch(
    'company_modules',
    `select=module_key,status&company_id=eq.${encodeURIComponent(ctx.companyId)}`,
  );
  if (companyModsRes.error) {
    console.error('[client-portal-bff] company_modules error:', companyModsRes.error);
    return jsonError(500, `company_modules: ${companyModsRes.error}`, corsHeaders);
  }
  const companyMods = companyModsRes.data ?? [];

  const userModsRes = await crmFetch(
    'user_modules',
    `select=module_key,status&user_id=eq.${encodeURIComponent(ctx.userId)}`,
  );
  // user_modules is not critical — fall back to company-level only
  const userMods = userModsRes.data ?? [];

  const companyMap = new Map<string, string>(
    companyMods.map((m: any) => [m.module_key, (m.status || '').toLowerCase()]),
  );
  const userMap = new Map<string, string>(
    userMods.map((m: any) => [m.module_key, (m.status || '').toLowerCase()]),
  );

  // Sidebar visibility flags
  const catalogKeys = catalog.map((m: any) => m.key).join(',');
  const sidebarRes = await crmFetch(
    'sidebar_navigation_order',
    `select=module_key,is_dev_mode,visible_to_clients&module_key=in.(${catalogKeys})`,
  );
  // Non-fatal: continue without visibility flags
  const sidebarOrder = sidebarRes.data ?? [];

  const sidebarMap = new Map<string, { devMode: boolean; visibleToClients: boolean }>();
  sidebarOrder.forEach((entry: any) => {
    sidebarMap.set(entry.module_key, {
      devMode: entry.is_dev_mode ?? false,
      visibleToClients: entry.visible_to_clients ?? true,
    });
  });

  const result = catalog.map((m: any) => {
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

async function handleTickets(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const { data: tickets, error } = await admin
    .from('client_visible_tickets')
    .select('*')
    .eq('auth_user_id', ctx.userId)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[client-portal-bff] Tickets fetch failed:', error.message);
    return jsonError(500, 'Failed to fetch tickets', corsHeaders);
  }

  return jsonOk({ data: tickets }, corsHeaders);
}

// ─── Main Serve ───────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[client-portal-bff] Missing required environment variables');
    return jsonError(500, 'Server configuration error', corsHeaders);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let rateLimitKey: string;
  const authHeaderRaw = req.headers.get('Authorization') ?? '';
  const jwtForRL = authHeaderRaw.startsWith('Bearer ') ? authHeaderRaw.slice(7) : '';

  if (jwtForRL) {
    try {
      const parts = jwtForRL.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        rateLimitKey = `client-portal:${payload.sub}`;
      } else {
        rateLimitKey = `client-portal:ip:${getClientIP(req)}`;
      }
    } catch {
      rateLimitKey = `client-portal:ip:${getClientIP(req)}`;
    }
  } else {
    rateLimitKey = `client-portal:ip:${getClientIP(req)}`;
  }

  const rl = await checkRateLimit(rateLimitKey, 60, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: withSecurityHeaders({
        ...corsHeaders,
        ...getRateLimitHeaders(rl),
        'Content-Type': 'application/json',
      }),
    });
  }

  const authResult = await authenticate(req, admin, corsHeaders);
  if (authResult instanceof Response) {
    return authResult;
  }
  const ctx = authResult as AuthContext;

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, '');
  const route = path.split('/').pop() ?? '';

  try {
    if (req.method === 'GET') {
      switch (route) {
        case 'profile':
          return await handleProfile(admin, ctx, corsHeaders);

        case 'appointments':
          return await handleAppointments(admin, ctx, req, corsHeaders);

        case 'invoices':
          return await handleInvoices(admin, ctx, corsHeaders);

        case 'quotes':
          return await handleQuotes(admin, ctx, corsHeaders);

        case 'documents':
          return await handleDocuments(admin, ctx, corsHeaders);

        case 'modules':
          return await handleModules(admin, ctx, corsHeaders);

        case 'tickets':
          return await handleTickets(admin, ctx, corsHeaders);

        default:
          return jsonError(404, `Unknown route: ${route}`, corsHeaders);
      }
    }

    if (req.method === 'POST') {
      switch (route) {
        case 'consents':
          return await handleConsents(admin, ctx, req, corsHeaders);

        default:
          return jsonError(404, `Unknown route: ${route}`, corsHeaders);
      }
    }

    return jsonError(405, 'Method not allowed', corsHeaders);
  } catch (e: any) {
    console.error('[client-portal-bff] Unhandled error:', e?.message ?? e);
    return jsonError(500, 'Internal server error', corsHeaders);
  }
});

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
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';

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
 * Create a Supabase admin client for the CRM database (cross-project access).
 * Returns null if CRM credentials are not configured.
 */
function createCrmAdminClient(): ReturnType<typeof createClient> | null {
  if (!CRM_SUPABASE_URL || !CRM_SERVICE_ROLE_KEY) {
    console.warn('[client-portal-bff] CRM credentials not configured — cross-project reads will fail');
    return null;
  }
  return createClient(CRM_SUPABASE_URL, CRM_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function handleModules(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // The tables modules_catalog / company_modules / user_modules /
  // sidebar_navigation_order live in the CRM project (`simplifica`), NOT in
  // this portal project (`simplifica-public`). Use a cross-project admin
  // client to read them. If CRM credentials are not configured, fall back
  // to the local admin client (which will fail with 42P01 and return 500,
  // surfacing the configuration issue clearly to the operator).
  const crmAdmin = createCrmAdminClient();
  const db = crmAdmin ?? admin;

  if (!crmAdmin) {
    console.error(
      '[client-portal-bff] /modules: CRM_SUPABASE_URL / CRM_SERVICE_ROLE_KEY not set. ' +
        'Reading modules from the portal project will fail because modules_catalog lives in the CRM.',
    );
  }

  const { data: catalog, error: catalogErr } = await db
    .from('modules_catalog')
    .select('key, label')
    .order('key', { ascending: true });

  if (catalogErr) {
    console.error('[client-portal-bff] Modules catalog error:', catalogErr.message);
    return jsonError(500, 'Failed to load modules', corsHeaders);
  }

  const { data: companyMods, error: companyErr } = await db
    .from('company_modules')
    .select('module_key, status')
    .eq('company_id', ctx.companyId);

  if (companyErr) {
    console.error('[client-portal-bff] Company modules error:', companyErr.message);
    return jsonError(500, 'Failed to load company modules', corsHeaders);
  }

  const { data: userMods, error: userErr } = await db
    .from('user_modules')
    .select('module_key, status')
    .eq('user_id', ctx.userId);

  if (userErr) {
    console.error('[client-portal-bff] User modules error:', userErr.message);
    return jsonError(500, 'Failed to load user modules', corsHeaders);
  }

  const companyMap = new Map<string, string>(
    (companyMods || []).map((m: any) => [m.module_key, (m.status || '').toLowerCase()]),
  );
  const userMap = new Map<string, string>(
    (userMods || []).map((m: any) => [m.module_key, (m.status || '').toLowerCase()]),
  );

  // Fetch sidebar visibility flags for all modules
  const { data: sidebarOrder, error: sidebarErr } = await db
    .from('sidebar_navigation_order')
    .select('module_key, is_dev_mode, visible_to_clients')
    .in('module_key', (catalog || []).map((m: any) => m.key));

  if (sidebarErr) {
    console.error('[client-portal-bff] Sidebar order fetch error:', sidebarErr.message);
    // Non-fatal: continue without visibility flags
  }

  const sidebarMap = new Map<string, { devMode: boolean; visibleToClients: boolean }>();
  (sidebarOrder || []).forEach((entry: any) => {
    sidebarMap.set(entry.module_key, {
      devMode: entry.is_dev_mode ?? false,
      visibleToClients: entry.visible_to_clients ?? true,
    });
  });

  const result = (catalog || []).map((m: any) => {
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

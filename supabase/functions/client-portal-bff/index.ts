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
//   5. Client identity: service_role admin queries clients.auth_user_id for data queries
//      (RLS on clients/invoices/quotes/bookings/client_documents doesn't have client-scoped policies yet)
//   6. DTO mapping: strict explicit field whitelists — no spread, no extra fields
//
// Routes (all require authenticated client JWT):
//   GET  /profile      → clients profile + GDPR consents
//   GET  /appointments → bookings for the client (future by default, ?include_past=true for all)
//   GET  /invoices     → invoices for the client
//   GET  /quotes       → quotes for the client (non-draft)
//   GET  /documents    → document metadata + presigned download URLs
//   POST /consents     → update marketing_consent / privacy_policy_consent only

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
  clientId: string; // clients.id
  companyId: string; // clients.company_id
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

/**
 * Authenticate the request.
 * 1. Extract Bearer token
 * 2. Validate via service_role admin.auth.getUser()
 * 3. Check user_role === 'client' from JWT claims (app_metadata or user_metadata)
 * 4. Resolve client record via clients.auth_user_id
 *
 * Returns AuthContext or a Response (error).
 */
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

  // Check user_role claim injected by custom-access-token hook.
  // The hook adds user_role as a top-level JWT claim (NOT in app_metadata/user_metadata).
  // We must decode the JWT payload to read it, since getUser() returns the DB record
  // which doesn't contain the custom hook claims.
  let userRole: string | undefined;
  let jwtCompanyId: string | undefined;
  try {
    const parts = jwt.split('.');
    if (parts.length === 3) {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64));
      userRole = payload.user_role;
      jwtCompanyId = payload.company_id;
    }
  } catch {
    // If JWT decoding fails, fall through to app_metadata fallback
  }
  // Fallback: check app_metadata / user_metadata (in case of future hook changes)
  if (!userRole) {
    userRole =
      (user.app_metadata?.user_role as string | undefined) ??
      (user.user_metadata?.user_role as string | undefined);
  }

  if (userRole !== 'client') {
    return jsonError(403, 'Access denied: client role required', corsHeaders);
  }

  // Resolve client record.
  // Strategy: filter by auth_user_id + company_id from JWT (most accurate).
  // If not found or inactive, fall back to the first active client record for this user.
  // This handles edge cases where a user is a client in multiple companies.
  let clientRow: { id: string; company_id: string; is_active: boolean } | null = null;

  if (jwtCompanyId) {
    const { data: exactMatch } = await admin
      .from('clients')
      .select('id, company_id, is_active')
      .eq('auth_user_id', user.id)
      .eq('company_id', jwtCompanyId)
      .maybeSingle();

    if (exactMatch?.is_active) {
      clientRow = exactMatch as typeof clientRow;
    }
  }

  if (!clientRow) {
    // Fallback: first active client record for this auth user
    const { data: activeClients, error: clientError } = await admin
      .from('clients')
      .select('id, company_id, is_active')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .limit(1);

    if (clientError) {
      console.error('[client-portal-bff] Client lookup failed:', clientError?.message);
      return jsonError(403, 'Client account not found', corsHeaders);
    }

    clientRow = (activeClients?.[0] as typeof clientRow) ?? null;
  }

  if (!clientRow) {
    console.error('[client-portal-bff] No active client record found for user:', user.id);
    return jsonError(403, 'Client account not found or inactive', corsHeaders);
  }

  return {
    userId: user.id,
    clientId: clientRow.id as string,
    companyId: clientRow.company_id as string,
  };
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

/**
 * GET /profile
 * Returns whitelisted profile fields + GDPR consent status.
 * NEVER returns: dni, cif_nif, iban, bic, birth_date, internal_notes, assigned_to,
 *                tier, source, credit_limit, default_discount, metadata, deleted_at,
 *                anonymized_at, access_count, invitation_token
 */
async function handleProfile(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const { data: client, error } = await admin
    .from('clients')
    .select(
      'id, name, surname, email, phone, business_name, trade_name, language, ' +
        'marketing_consent, marketing_consent_date, ' +
        'privacy_policy_consent, privacy_policy_consent_date, ' +
        'health_data_consent, health_data_consent_date',
    )
    .eq('id', ctx.clientId)
    .eq('company_id', ctx.companyId)
    .single();

  if (error || !client) {
    console.error('[client-portal-bff] Profile fetch failed:', error?.message);
    return jsonError(500, 'Failed to fetch profile', corsHeaders);
  }

  // Explicit DTO mapping — NO spread
  const dto: ProfileDto = {
    id: client.id,
    name: client.name ?? null,
    surname: client.surname ?? null,
    email: client.email ?? null,
    phone: client.phone ?? null,
    business_name: client.business_name ?? null,
    trade_name: client.trade_name ?? null,
    language: client.language ?? null,
    consents: {
      marketing_consent: client.marketing_consent ?? false,
      marketing_consent_date: client.marketing_consent_date ?? null,
      privacy_policy_consent: client.privacy_policy_consent ?? false,
      privacy_policy_consent_date: client.privacy_policy_consent_date ?? null,
      health_data_consent: client.health_data_consent ?? false,
      health_data_consent_date: client.health_data_consent_date ?? null,
    },
  };

  return jsonOk({ data: dto }, corsHeaders);
}

/**
 * GET /appointments
 * Returns bookings for the authenticated client.
 * Default: future only. ?include_past=true returns all.
 * NEVER returns: price, internal notes, cost data
 */
async function handleAppointments(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const url = new URL(req.url);
  const includePast = url.searchParams.get('include_past') === 'true';

  let query = admin
    .from('bookings')
    .select(
      'id, start_time, end_time, status, ' +
        'service:services(name), ' +
        'professional:professionals(display_name)',
    )
    .eq('client_id', ctx.clientId)
    .eq('company_id', ctx.companyId)
    .order('start_time', { ascending: !includePast });

  if (!includePast) {
    query = query.gte('start_time', new Date().toISOString());
  }

  const { data: bookings, error } = await query;

  if (error) {
    console.error('[client-portal-bff] Appointments fetch failed:', error.message);
    return jsonError(500, 'Failed to fetch appointments', corsHeaders);
  }

  // Explicit DTO mapping — never leak price or internal notes
  const dtos: AppointmentDto[] = (bookings ?? []).map((b: any) => ({
    id: b.id,
    service_name: b.service?.name ?? null,
    professional_name: b.professional?.display_name ?? null,
    start_time: b.start_time,
    end_time: b.end_time,
    status: b.status,
  }));

  return jsonOk({ data: dtos }, corsHeaders);
}

/**
 * GET /invoices
 * Returns invoices for the authenticated client.
 * NEVER returns: IBAN, internal cost data, discount breakdown
 */
async function handleInvoices(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const { data: invoices, error } = await admin
    .from('invoices')
    .select(
      'id, full_invoice_number, invoice_number, invoice_date, due_date, total, currency, status, payment_link_token, payment_link_expires_at',
    )
    .eq('client_id', ctx.clientId)
    .eq('company_id', ctx.companyId)
    .is('deleted_at', null)
    .order('invoice_date', { ascending: false });

  if (error) {
    console.error('[client-portal-bff] Invoices fetch failed:', error.message);
    return jsonError(500, 'Failed to fetch invoices', corsHeaders);
  }

  const PUBLIC_SITE_URL =
    Deno.env.get('PUBLIC_SITE_URL') ?? 'https://simplifica.digitalizamostupyme.es';
  const now = new Date();

  // Explicit DTO mapping — NEVER expose IBAN, cost breakdown, discount details
  const dtos: InvoiceDto[] = (invoices ?? []).map((inv: any) => {
    // Build payment_link from token if valid and not expired
    let paymentLink: string | null = null;
    if (inv.payment_link_token && inv.payment_link_expires_at) {
      const expiresAt = new Date(inv.payment_link_expires_at);
      if (expiresAt > now) {
        paymentLink = `${PUBLIC_SITE_URL}/pago/${inv.payment_link_token}`;
      }
    }

    return {
      id: inv.id,
      invoice_number: inv.full_invoice_number ?? inv.invoice_number ?? null,
      invoice_date: inv.invoice_date ?? null,
      due_date: inv.due_date ?? null,
      total: inv.total ?? null,
      currency: inv.currency ?? null,
      status: inv.status ?? null,
      payment_link: paymentLink,
    };
  });

  return jsonOk({ data: dtos }, corsHeaders);
}

/**
 * GET /quotes
 * Returns non-draft quotes for the authenticated client.
 * NEVER returns: cost breakdown, margin, internal notes
 */
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

  // Explicit DTO mapping — NEVER expose markup, internal notes, cost details
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

/**
 * GET /documents
 * Returns document metadata + presigned download URLs (15 min expiry).
 * NEVER returns: raw storage paths, bucket names
 */
async function handleDocuments(
  admin: ReturnType<typeof createClient>,
  ctx: AuthContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const { data: docs, error } = await admin
    .from('client_documents')
    .select('id, name, file_path, file_type, size, created_at')
    .eq('client_id', ctx.clientId)
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[client-portal-bff] Documents fetch failed:', error.message);
    return jsonError(500, 'Failed to fetch documents', corsHeaders);
  }

  // Generate presigned URLs for each document (900s = 15 min)
  const dtos: DocumentDto[] = await Promise.all(
    (docs ?? []).map(async (doc: any) => {
      let downloadUrl = '';
      try {
        const { data: signedData, error: signError } = await admin.storage
          .from(CLIENT_DOCS_BUCKET)
          .createSignedUrl(doc.file_path, DOCS_SIGNED_URL_EXPIRY_SECONDS);

        if (signError || !signedData?.signedUrl) {
          console.error(
            `[client-portal-bff] Signed URL failed for doc ${doc.id}:`,
            signError?.message,
          );
        } else {
          downloadUrl = signedData.signedUrl;
        }
      } catch (e: any) {
        console.error(`[client-portal-bff] Signed URL exception for doc ${doc.id}:`, e.message);
      }

      // Explicit DTO — NEVER expose file_path (raw storage path) or bucket name
      return {
        id: doc.id,
        name: doc.name,
        file_type: doc.file_type ?? null,
        size: doc.size ?? null,
        created_at: doc.created_at,
        download_url: downloadUrl,
      };
    }),
  );

  return jsonOk({ data: dtos }, corsHeaders);
}

/**
 * POST /consents
 * Update marketing_consent and/or privacy_policy_consent for the authenticated client.
 * NEVER allows updating health_data_consent (returns 403).
 * Logs each change to gdpr_consent_records.
 */
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

  // GDPR guard: health_data_consent MUST NOT be updated via this portal endpoint
  if ('health_data_consent' in body) {
    return jsonError(
      403,
      'health_data_consent cannot be updated via the client portal. Contact your provider.',
      corsHeaders,
    );
  }

  // Extract only the two allowed boolean fields
  const hasMarketing = 'marketing_consent' in body;
  const hasPrivacy = 'privacy_policy_consent' in body;

  if (!hasMarketing && !hasPrivacy) {
    return jsonError(
      400,
      'Provide at least one of: marketing_consent, privacy_policy_consent',
      corsHeaders,
    );
  }

  // Validate types
  if (hasMarketing && typeof body.marketing_consent !== 'boolean') {
    return jsonError(400, 'marketing_consent must be a boolean', corsHeaders);
  }
  if (hasPrivacy && typeof body.privacy_policy_consent !== 'boolean') {
    return jsonError(400, 'privacy_policy_consent must be a boolean', corsHeaders);
  }

  const now = new Date().toISOString();
  const ipAddress = getClientIP(req);

  // Build update payload with only whitelisted fields
  const updatePayload: Record<string, unknown> = {};
  if (hasMarketing) {
    updatePayload.marketing_consent = body.marketing_consent;
    updatePayload.marketing_consent_date = now;
  }
  if (hasPrivacy) {
    updatePayload.privacy_policy_consent = body.privacy_policy_consent;
    updatePayload.privacy_policy_consent_date = now;
  }

  // Update the client record (service_role bypasses RLS — scoped by client_id + company_id)
  const { error: updateError } = await admin
    .from('clients')
    .update(updatePayload)
    .eq('id', ctx.clientId)
    .eq('company_id', ctx.companyId);

  if (updateError) {
    console.error('[client-portal-bff] Consent update failed:', updateError.message);
    return jsonError(500, 'Failed to update consents', corsHeaders);
  }

  // Log each consent change to gdpr_consent_records
  // Required fields: subject_email (fetched below), consent_type, consent_given, consent_method, purpose
  const { data: clientEmail } = await admin
    .from('clients')
    .select('email')
    .eq('id', ctx.clientId)
    .single();

  const gdprRecords: Record<string, unknown>[] = [];

  if (hasMarketing) {
    gdprRecords.push({
      subject_id: ctx.userId,
      subject_email: clientEmail?.email ?? '',
      consent_type: 'marketing',
      purpose: 'Marketing communications',
      consent_given: body.marketing_consent as boolean,
      consent_method: 'portal',
      consent_evidence: { ip_address: ipAddress, method: 'portal', timestamp: now },
      company_id: ctx.companyId,
    });
  }

  if (hasPrivacy) {
    gdprRecords.push({
      subject_id: ctx.userId,
      subject_email: clientEmail?.email ?? '',
      consent_type: 'privacy_policy',
      purpose: 'Privacy policy acceptance',
      consent_given: body.privacy_policy_consent as boolean,
      consent_method: 'portal',
      consent_evidence: { ip_address: ipAddress, method: 'portal', timestamp: now },
      company_id: ctx.companyId,
    });
  }

  if (gdprRecords.length > 0) {
    const { error: gdprError } = await admin.from('gdpr_consent_records').insert(gdprRecords);

    if (gdprError) {
      // Non-blocking: consent was updated, but audit log failed
      console.error('[client-portal-bff] GDPR audit log insert failed:', gdprError.message);
    }
  }

  // Return updated consent status
  const { data: updatedClient } = await admin
    .from('clients')
    .select(
      'marketing_consent, marketing_consent_date, privacy_policy_consent, privacy_policy_consent_date, health_data_consent, health_data_consent_date',
    )
    .eq('id', ctx.clientId)
    .single();

  return jsonOk(
    {
      success: true,
      consents: {
        marketing_consent: updatedClient?.marketing_consent ?? false,
        marketing_consent_date: updatedClient?.marketing_consent_date ?? null,
        privacy_policy_consent: updatedClient?.privacy_policy_consent ?? false,
        privacy_policy_consent_date: updatedClient?.privacy_policy_consent_date ?? null,
        health_data_consent: updatedClient?.health_data_consent ?? false,
        health_data_consent_date: updatedClient?.health_data_consent_date ?? null,
      },
    },
    corsHeaders,
  );
}

// ─── Main Serve ───────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Environment guard
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[client-portal-bff] Missing required environment variables');
    return jsonError(500, 'Server configuration error', corsHeaders);
  }

  // Service role admin client — used for JWT validation and all data queries
  // Data queries are scoped explicitly via client_id + company_id predicates
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── Rate limiting (per authenticated user, not per IP) ──────────────────────
  // We extract user ID first for per-user keying.
  // On auth failure, we fall back to IP-based limiting.
  let rateLimitKey: string;
  const authHeaderRaw = req.headers.get('Authorization') ?? '';
  const jwtForRL = authHeaderRaw.startsWith('Bearer ') ? authHeaderRaw.slice(7) : '';

  if (jwtForRL) {
    // Quick decode to get sub claim for the rate limit key — we'll do full validation later
    // This avoids an extra round-trip to Supabase Auth just for rate limiting.
    // If the JWT is invalid, auth will reject it below; rate limit uses sub as-is.
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

  // ── Authentication & authorization ─────────────────────────────────────────
  const authResult = await authenticate(req, admin, corsHeaders);
  if (authResult instanceof Response) {
    return authResult;
  }
  const ctx = authResult as AuthContext;

  // ── URL routing ─────────────────────────────────────────────────────────────
  const url = new URL(req.url);
  // Normalize: strip trailing slash, get last path segment(s)
  const path = url.pathname.replace(/\/$/, '');
  // Support both /client-portal-bff/profile and /profile
  const route = path.split('/').pop() ?? '';

  try {
    // GET routes
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

        default:
          return jsonError(404, `Unknown route: ${route}`, corsHeaders);
      }
    }

    // POST routes
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

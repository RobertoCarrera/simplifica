/**
 * Edge Function: company-email-accounts
 * CRUD for company email accounts (AWS SES configuration)
 *
 * Endpoints:
 *   GET    /                        - List accounts for the authenticated user's company
 *   GET    /route53-domains         - List Route53 hosted zones (superadmin only)
 *   POST   /                        - Create account (owner/admin only)
 *   PATCH  /:id                     - Update account
 *   DELETE /:id                     - Soft delete (set is_active=false)
 *   POST   /:id/verify              - Trigger verification process
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, isValidUUID, sanitizeText } from '../_shared/security.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailAccount {
  id: string;
  company_id: string;
  email: string;
  display_name: string | null;
  provider: string;
  provider_type: string;
  ses_from_email: string | null;
  ses_iam_role_arn: string | null;
  is_verified: boolean;
  verified_at: string | null;
  is_active: boolean;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  // SMTP
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_encrypted_password: string | null;
  // OAuth2
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  oauth_refresh_token: string | null;
  oauth_token_expiry: string | null;
  auth_method: 'password' | 'oauth2' | null;
}

interface CompanyEmailVerification {
  id: string;
  company_id: string;
  email_account_id: string;
  verification_type: string;
  status: string;
  dns_record_name: string | null;
  dns_record_value: string | null;
  verified_at: string | null;
  error_message: string | null;
  created_at: string;
}

// ── In-memory OAuth CSRF state store (10-min TTL) ────────────────────────────
// Map<state, {accountId: string, companyId: string, expiresAt: Date}>
const oauthStateStore = new Map<string, { accountId: string; companyId: string; expiresAt: Date }>();

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = new Date();
  for (const [key, val] of oauthStateStore.entries()) {
    if (val.expiresAt < now) oauthStateStore.delete(key);
  }
}, 5 * 60 * 1000);

// ── Auth helper ───────────────────────────────────────────────────────────────
//
// SECURITY: JWT signature MUST be cryptographically verified. Earlier this
// helper base64-decoded the JWT payload and trusted `payload.sub` directly,
// which allowed an attacker to forge a {alg:"none"} token and impersonate any
// user (CRITICAL-1, rafter sqli-audit 2026-06-21). With `verify_jwt = true` in
// config.toml the gateway validates the signature before the function runs;
// we additionally call `supabaseAdmin.auth.getUser(token)` inside the
// handler as defense in depth — this re-verifies the JWT against the
// project's signing key and rejects forged / expired / revoked tokens.

interface AuthenticatedUser {
  id: string;
  email?: string;
  aud?: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

async function getAuthUser(
  req: Request,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<AuthenticatedUser> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    const err = new Error('Missing Authorization header') as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  // Cryptographically verify the JWT signature against Supabase Auth's
  // signing key. Rejects {alg:"none"} and any forged signature.
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    const err = new Error('Invalid or expired token') as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  return {
    id: user.id,
    email: user.email ?? undefined,
    aud: user.aud ?? undefined,
    role: user.role ?? undefined,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
  };
}

/** Check if user is owner/admin of the company */
async function getUserCompanyRole(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
): Promise<'owner' | 'admin' | 'member' | null> {
  const { data } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single();
  return data?.role as 'owner' | 'admin' | 'member' | null;
}

// ── DNS verification helpers ──────────────────────────────────────────────────

/**
 * Generate DNS records needed for SES domain verification.
 * Returns the records the company must add to their DNS.
 */
function generateSESVerificationDNS(sesFromEmail: string): { type: string; name: string; value: string }[] {
  // Extract domain from email
  const domain = sesFromEmail.split('@')[1];
  if (!domain) return [];

  const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

  return [
    { type: 'SPF', name: domain, value: `v=spf1 include:amazonses.com ~all` },
    { type: 'DKIM', name: `${token}._domainkey.${domain}`, value: `v=DKIM1; k=rsa; p=...` },
    { type: 'DMARC', name: `_dmarc.${domain}`, value: `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${domain}` },
  ];
}

// ── JSON response helpers ──────────────────────────────────────────────────────

function jsonSuccess(status: number, data: unknown, req: Request) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, error: string, req: Request) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// ── Sanitization helpers ───────────────────────────────────────────────────────

function sanitizeEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(trimmed)) return '';
  return trimmed.slice(0, 255);
}

function sanitizeString(value: unknown, maxLength = 255): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n"<>]/g, '').slice(0, maxLength).trim();
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Rate limiting FIRST (before CORS preflight) — Rafter v0.22 F-01 fix
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`company-email-accounts:${ip}`, 30, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
        ...getRateLimitHeaders(rl),
      },
    });
  }

  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  // Service role client for token verification and admin operations
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // ANON client for RLS-protected data access
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
  );

  try {
    // Authenticate user
    const user = await getAuthUser(req, supabaseAdmin);
    const userId = user.id;

    // Parse URL to get path params
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // path: /functions/v1/company-email-accounts or /functions/v1/company-email-accounts/:id
    const idParam = pathParts[pathParts.length - 1];
    const isIdParam = idParam && idParam !== 'company-email-accounts' && isValidUUID(idParam);
    const resourceId = isIdParam ? idParam : null;

    const method = req.method;

    // ── GET /company-email-accounts ─────────────────────────────────────────
    if (method === 'GET' && !resourceId) {
      // Get user's companies
      const { data: memberData } = await supabaseClient
        .from('company_members')
        .select('company_id')
        .eq('user_id', userId);

      const companyIds = memberData?.map((m: { company_id: string }) => m.company_id) ?? [];
      if (companyIds.length === 0) {
        return jsonSuccess(200, [], req);
      }

      // For simplicity, use the first company (multi-company users can filter)
      const companyId = companyIds[0];

      const { data: accounts, error } = await supabaseClient
        .from('company_email_accounts')
        .select('*')
        .eq('company_id', companyId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return jsonSuccess(200, accounts ?? [], req);
    }

    // ── GET /company-email-accounts/route53-domains ─────────────────────────
    // Returns hosted zones from Route53 (for superadmin domain selector)
    if (method === 'GET' && pathParts[pathParts.length - 1] === 'route53-domains') {
      const { data: memberData } = await supabaseClient
        .from('company_members')
        .select('role')
        .eq('user_id', userId)
        .limit(1);

      const role = memberData?.[0]?.role;
      if (role !== 'superadmin') {
        return jsonError(403, 'Solo superadmins pueden ver dominios de Route53', req);
      }

      try {
        const { Route53Client, ListHostedZonesCommand } = await import('npm:@aws-sdk/client-route-53');
        const region = Deno.env.get('AWS_REGION') ?? 'eu-west-1';
        const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
        const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';

        const route53 = new Route53Client({ region, credentials: { accessKeyId, secretAccessKey } });
        const cmd = new ListHostedZonesCommand({});
        const result = await route53.send(cmd);

        const domains = (result.HostedZones ?? [])
          .filter((z: any) => !z.Config?.PrivateZone) // only public zones
          .map((z: any) => ({
            name: z.Name.replace(/\.$/, ''), // remove trailing dot
            zoneId: z.Id,
          }));

        return jsonSuccess(200, domains, req);
      } catch (err) {
        console.error('[company-email-accounts] Route53 error:', err);
        return jsonError(502, 'Error al obtener dominios de Route53', req);
      }
    }

    // ── POST /company-email-accounts ─────────────────────────────────────────
    if (method === 'POST' && !resourceId) {
      const body = await req.json().catch(() => ({}));
      const { action } = body;

      // ── POST /company-email-accounts (action=get-auth-url) ─────────────────
      if (action === 'get-auth-url') {
        const { account_id, redirect_uri } = body;
        if (!account_id) return jsonError(400, 'account_id requerido', req);

        const accountId = typeof account_id === 'string' ? account_id.trim() : '';
        if (!accountId || !isValidUUID(accountId)) {
          return jsonError(400, 'account_id inválido', req);
        }
        const redirectUri = typeof redirect_uri === 'string' ? redirect_uri.trim() : '';
        console.log('[get-auth-url] userId:', userId, 'accountId:', accountId);

        // Look up the account
        const { data: account, error: accountErr } = await supabaseAdmin
          .from('company_email_accounts')
          .select('*')
          .eq('id', accountId)
          .single();
        if (accountErr || !account) {
          return jsonError(404, 'Cuenta no encontrada', req);
        }
        console.log('[get-auth-url] account result:', JSON.stringify({ data: account?.company_id, error: accountErr?.message }));

        // Verify user is a member of the account's company
        const { data: memberData, error: memberErr } = await supabaseAdmin
          .from('company_members')
          .select('company_id, role_id')
          .eq('user_id', userId)
          .eq('company_id', account.company_id)
          .limit(1);
        if (memberErr) {
          console.error('[get-auth-url] member lookup error:', memberErr);
          return jsonError(500, 'Error al verificar acceso', req);
        }
        if (!memberData || memberData.length === 0) {
          return jsonError(403, 'No tienes acceso a esta cuenta', req);
        }
        console.log('[get-auth-url] member result:', JSON.stringify({ data: memberData, error: memberErr?.message }));

        // Check role
        const roleId = memberData[0]?.role_id;
        let roleName: string | null = null;
        if (roleId) {
          const { data: rn } = await supabaseAdmin.from('app_roles').select('name').eq('id', roleId).single();
          roleName = rn?.name ?? null;
        }
        if (roleName !== 'owner' && roleName !== 'admin' && roleName !== 'super_admin') {
          return jsonError(403, 'Solo owners y admins pueden iniciar OAuth', req);
        }

        // Build Google OAuth URL
        const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
        const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
        if (!clientId || !clientSecret) {
          return jsonError(500, 'Google OAuth no está configurado', req);
        }

        const scopes = [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.modify',
        ].join(' ');

        const state = `${accountId}:${crypto.randomUUID()}`;
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri || 'http://localhost:5173/configuracion');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('scope', scopes);
        authUrl.searchParams.set('state', state);

        console.log('[get-auth-url] returning URL, state:', state.slice(0, 20));
        return jsonSuccess(200, { auth_url: authUrl.toString() }, req);
      }

      // ── POST /company-email-accounts (default: create account) ────────────
      // Use company_id from request body if the client provides it.
      // Fall back to auto-detection for backward compatibility.
      const { domain, display_name, provider_type, iam_access_key_id, aws_secret_key, company_id: bodyCompanyId } = body;

      let companyId: string | null = null;
      let roleName: string | null = null;

      if (bodyCompanyId && typeof bodyCompanyId === 'string' && isValidUUID(bodyCompanyId)) {
        // Client explicitly specified the company — verify the user has access
        const { data: memRow } = await supabaseAdmin
          .from('company_members')
          .select('company_id, role_id')
          .eq('user_id', userId)
          .eq('company_id', bodyCompanyId)
          .limit(1);

        if (!memRow || memRow.length === 0) {
          return jsonError(403, 'No tienes acceso a esta empresa', req);
        }

        companyId = bodyCompanyId;
        const roleId = memRow[0]?.role_id;
        if (roleId) {
          const { data: rn } = await supabaseAdmin.from('app_roles').select('name').eq('id', roleId).single();
          roleName = rn?.name ?? null;
        }
      } else {
        // Backward-compatible auto-detection: pick the first company the user belongs to
        const { data: memberData } = await supabaseAdmin
          .from('company_members')
          .select('company_id, role_id')
          .eq('user_id', userId);

        const companyIds = memberData?.map((m: { company_id: string; role_id?: string }) => m.company_id) ?? [];
        if (companyIds.length === 0) {
          return jsonError(403, 'No tienes acceso a ninguna empresa', req);
        }

        // Prefer the company where the user has the highest role (owner > admin > ...)
        const roleWeight: Record<string, number> = { 'owner': 3, 'super_admin': 3, 'admin': 2 };
        let bestIdx = 0;
        let bestWeight = 0;
        for (let i = 0; i < companyIds.length; i++) {
          const m = memberData[i];
          if (!m?.role_id) continue;
          const { data: rn } = await supabaseAdmin.from('app_roles').select('name').eq('id', m.role_id).single();
          const w = roleWeight[rn?.name ?? ''] ?? 0;
          if (w > bestWeight) {
            bestWeight = w;
            bestIdx = i;
          }
        }
        companyId = companyIds[bestIdx];
        const memberEntry = memberData[bestIdx];
        const roleId = memberEntry?.role_id;
        if (roleId) {
          const { data: rn } = await supabaseAdmin.from('app_roles').select('name').eq('id', roleId).single();
          roleName = rn?.name ?? null;
        }
      }

      if (!companyId) {
        return jsonError(403, 'No tienes acceso a ninguna empresa', req);
      }

      if (roleName !== 'owner' && roleName !== 'admin' && roleName !== 'super_admin') {
        return jsonError(403, 'Solo owners y admins pueden crear cuentas de email', req);
      }

      // Validate domain
      const domainRx = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}\.[a-zA-Z]{2,}$/;
      const cleanDomain = typeof domain === 'string' ? domain.trim().toLowerCase() : '';
      if (!cleanDomain || !domainRx.test(cleanDomain)) {
        return jsonError(400, 'Dominio inválido', req);
      }

      // Auto-calculate email from domain
      const cleanEmail = `noreply@${cleanDomain}`;
      const cleanDisplayName = display_name ? sanitizeString(display_name, 255) : null;
      const cleanProvider = 'ses';
      // SES IAM Role ARN comes from environment secrets (system-wide config)
      const sesIamRoleArn = Deno.env.get('SES_IAM_ROLE_ARN') ?? '';

      // Check for duplicate email in same company (same provider only —
      // a company can have both SES and google_workspace with the same email)
      const { data: existing } = await supabaseClient
        .from('company_email_accounts')
        .select('id')
        .eq('company_id', companyId)
        .eq('email', cleanEmail)
        .eq('provider', cleanProvider)
        .single();

      if (existing) {
        return jsonError(409, 'Ya existe una cuenta SES con este email para tu empresa', req);
      }

      // Check if this will be the first (make it primary)
      const { count } = await supabaseClient
        .from('company_email_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);

      const isFirst = (count ?? 0) === 0;

      const insertData: Record<string, unknown> = {
        company_id: companyId,
        email: cleanEmail,
        display_name: cleanDisplayName,
        provider: cleanProvider,
        ses_from_email: cleanEmail,
        ses_iam_role_arn: sesIamRoleArn,
        is_verified: false,
        is_active: true,
        is_primary: isFirst,
        provider_type: provider_type || 'ses_shared',
      };

      // Handle AWS IAM credentials
      if (iam_access_key_id) insertData['iam_access_key_id'] = iam_access_key_id;
      if (aws_secret_key) {
        const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
        const { data: encKey } = await supabaseAdmin.rpc('encrypt_text', { plaintext: aws_secret_key, key: encryptionKey });
        if (encKey) insertData['smtp_encrypted_password'] = encKey;
      }

      const { data: account, error } = await supabaseClient
        .from('company_email_accounts')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Create verification records for SPF/DKIM/DMARC
      const dnsRecords = generateSESVerificationDNS(cleanEmail);

      if (dnsRecords.length > 0) {
        const verificationRecords = dnsRecords.map(rec => ({
          company_id: companyId,
          email_account_id: account.id,
          verification_type: rec.type.toLowerCase() as 'spf' | 'dkim' | 'dmarc',
          status: 'pending',
          dns_record_name: rec.name,
          dns_record_value: rec.value,
        }));

        await supabaseClient
          .from('company_email_verification')
          .insert(verificationRecords)
          .select();
      }

      return jsonSuccess(201, account, req);
    }

// ── GET /company-email-accounts/get-auth-url ────────────────────────────────
    // Called by Angular to initiate OAuth. Supports both GET (via invoke POST) and POST.
    // The endpoint returns the Google OAuth URL for the google-workspace account.
    if ((method === 'GET' || method === 'POST') && pathParts[pathParts.length - 1] === 'get-auth-url') {
      // For POST, body has { account_id }. For GET, account_id comes from query params.
      let accountId: string | null = null;
      if (method === 'POST') {
        const body = await req.json().catch(() => ({}));
        accountId = body?.account_id ?? null;
      } else {
        accountId = new URL(req.url).searchParams.get('account_id');
      }

      console.log('[get-auth-url] userId:', userId, 'accountId:', accountId);

      if (!accountId || !isValidUUID(accountId)) {
        return jsonError(400, 'account_id inválido o faltante', req);
      }

      // Use admin client to bypass RLS — we need to read the account to verify ownership
      const { data: account, error: accountErr } = await supabaseAdmin
        .from('company_email_accounts')
        .select('company_id, email, provider_type')
        .eq('id', accountId)
        .single();

      console.log('[get-auth-url] account result:', JSON.stringify({ data: account?.company_id, error: accountErr?.message }));

      if (!account) {
        return jsonError(404, 'Cuenta no encontrada', req);
      }

      if (account.provider_type !== 'google_workspace') {
        return jsonError(400, 'Solo cuentas google_workspace soportan OAuth', req);
      }

      // Verify user is owner/admin of the company using admin client (bypasses RLS on company_members)
      const { data: memberData, error: memberErr } = await supabaseAdmin
        .from('company_members')
        .select('role_id')
        .eq('user_id', userId)
        .eq('company_id', account.company_id)
        .single();

      console.log('[get-auth-url] member result:', JSON.stringify({ data: memberData, error: memberErr?.message }));

      if (!memberData?.role_id) {
        return jsonError(403, 'No tienes acceso a esta empresa', req);
      }

      // Get role name from app_roles
      const { data: roleData } = await supabaseAdmin
        .from('app_roles')
        .select('name')
        .eq('id', memberData.role_id)
        .single();

      const role = roleData?.name;
      if (role !== 'owner' && role !== 'admin' && role !== 'super_admin') {
        return jsonError(403, 'Solo owners y admins pueden configurar OAuth', req);
      }

      // Generate CSRF state with 10-min TTL
      const state = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      oauthStateStore.set(state, { accountId, companyId: account.company_id, expiresAt });

      const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/company-email-accounts/google-callback`;

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', state);

      return jsonSuccess(200, { auth_url: authUrl.toString() }, req);
    }


    // ── POST /company-email-accounts/google-callback ─────────────────────────
    if (method === 'POST' && pathParts[pathParts.length - 1] === 'google-callback') {
      const { code, state, account_id } = await req.json();

      if (!code || !state || !account_id) {
        return jsonError(400, 'code, state y account_id son requeridos', req);
      }

      if (!isValidUUID(account_id)) {
        return jsonError(400, 'account_id inválido', req);
      }

      // Validate CSRF state
      const storedState = oauthStateStore.get(state);
      if (!storedState || storedState.expiresAt < new Date()) {
        oauthStateStore.delete(state);
        return jsonError(400, 'State inválido o expirado — reinicia el flujo OAuth', req);
      }

      if (storedState.accountId !== account_id) {
        return jsonError(400, 'Account ID no coincide con el estado OAuth', req);
      }

      oauthStateStore.delete(state);

      // Exchange code for tokens
      const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/company-email-accounts/google-callback`;

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        console.error('[google-callback] Token exchange failed:', err);
        return jsonError(400, `Error OAuth: ${err.error_description ?? err.error}`, req);
      }

      const tokens = await tokenRes.json();
      const accessToken = tokens.access_token as string;
      const refreshToken = tokens.refresh_token as string;
      const expiresIn = (tokens.expires_in as number) ?? 3600;
      const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

      // Encrypt tokens before storing
      const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';

      const { data: encRefresh, error: encErr } = await supabaseAdmin.rpc('encrypt_text', {
        plaintext: refreshToken,
        key: encryptionKey,
      });

      if (encErr || !encRefresh) {
        console.error('[google-callback] Failed to encrypt refresh token:', encErr);
        return jsonError(500, 'Error al cifrar tokens OAuth', req);
      }

      // Update account with OAuth tokens
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('company_email_accounts')
        .update({
          oauth_refresh_token: encRefresh,
          oauth_token_expiry: tokenExpiry.toISOString(),
          auth_method: 'oauth2',
          is_verified: true,
          verified_at: new Date().toISOString(),
        })
        .eq('id', account_id)
        .select()
        .single();

      if (updateErr) {
        console.error('[google-callback] Failed to update account:', updateErr);
        return jsonError(500, 'Error al guardar tokens OAuth', req);
      }

      // Send a verification test email (non-fatal if it fails)
      try {
        const testEmail = updated?.email;
        if (testEmail && accessToken) {
          const rawMsg = [
            `From: <${testEmail}>`,
            `To: <${testEmail}>`,
            `Subject: Verificación OAuth — Simplifica CRM`,
            'Content-Type: text/html; charset=utf-8',
            '',
            '<p>OAuth configurado correctamente. Este es un email de verificación.</p>',
          ].join('\r\n');
          const b64 = btoa(rawMsg).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw: b64 }),
          });
        }
      } catch (e: any) {
        console.warn('[google-callback] Verification email failed (non-fatal):', e.message);
      }

      return jsonSuccess(200, { message: 'OAuth configurado correctamente', account: updated }, req);
    }

    // ── POST /company-email-accounts/:id/test ─────────────────────────────────
    if (method === 'POST' && resourceId && pathParts[pathParts.length - 2] === '' && req.url.includes('/test')) {
      if (!isValidUUID(resourceId)) {
        return jsonError(400, 'ID de cuenta inválido', req);
      }

      // Validate user owns account and is owner/admin
      const { data: account } = await supabaseClient
        .from('company_email_accounts')
        .select('*')
        .eq('id', resourceId)
        .single();

      if (!account) {
        return jsonError(404, 'Cuenta no encontrada', req);
      }

      const role = await getUserCompanyRole(supabaseClient, userId, account.company_id);
      if (role !== 'owner' && role !== 'admin') {
        return jsonError(403, 'Solo owners y admins pueden enviar emails de prueba', req);
      }

      const { recipient_email } = await req.json();
      if (!recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
        return jsonError(400, 'recipient_email inválido', req);
      }

      // Build test email params
      const fromEmail = account.ses_from_email || account.email;
      const fromName = account.display_name || 'Simplifica CRM';
      const subject = `Test email from ${fromEmail}`;
      const htmlBody = `<p>This is a test email from Simplifica CRM.</p><p>If you received this, the configuration is working correctly.</p>`;

      let result: { success: boolean; messageId?: string; error?: string };

      if (account.provider_type === 'google_workspace') {
        if (account.auth_method === 'oauth2' && account.oauth_refresh_token) {
          // OAuth2 path
          const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
          const { data: refreshToken } = await supabaseAdmin.rpc('decrypt_text', {
            encrypted_hex: account.oauth_refresh_token,
            key: encryptionKey,
          });
          if (!refreshToken) {
            return jsonError(500, 'No se pudo desencriptar el token OAuth', req);
          }
          const { GmailAPIProvider } = await import('../send-branded-email/providers/gmail-api-provider.ts');
          const gmailProvider = new GmailAPIProvider(refreshToken, account.id, supabaseAdmin);
          const testResult = await gmailProvider.test({
            from: { email: fromEmail, name: fromName },
            to: [recipient_email],
            subject,
            html: htmlBody,
          });
          result = { success: testResult.success, messageId: testResult.message, error: testResult.error?.message };
        } else {
          // SMTP path — use nodemailer directly
          const encPw = account.smtp_encrypted_password;
          if (!encPw) return jsonError(500, 'Credenciales SMTP no configuradas', req);
          const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
          const { data: password } = await supabaseAdmin.rpc('decrypt_text', {
            encrypted_hex: encPw,
            key: encryptionKey,
          });
          if (!password) return jsonError(500, 'No se pudo desencriptar la contraseña SMTP', req);

          // Send via SMTP using nodemailer
          const nodemailer = await import('https://esm.sh/nodemailer@1.0.0');
          const transporter = nodemailer.createTransport({
            host: account.smtp_host ?? 'smtp-relay.gmail.com',
            port: account.smtp_port ?? 587,
            secure: (account.smtp_port ?? 587) === 465,
            auth: { user: account.smtp_user ?? fromEmail, pass: password },
            tls: { rejectUnauthorized: false },
          });

          const info = await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: recipient_email,
            subject,
            html: htmlBody,
          });
          result = { success: true, messageId: info.messageId ?? 'unknown' };
        }
      } else {
        return jsonError(400, 'Esta cuenta no soporta emails de prueba', req);
      }

      if (result.success) {
        return jsonSuccess(200, { message: `Test email enviado a ${recipient_email}` }, req);
      } else {
        return jsonError(500, { success: false, error: { code: 'TEST_FAILED', message: result.error ?? 'Unknown error' } }, req);
      }
    }

    // ── PATCH /company-email-accounts/:id ────────────────────────────────────
    if (method === 'PATCH' && resourceId) {
      if (!isValidUUID(resourceId)) {
        return jsonError(400, 'ID de cuenta inválido', req);
      }

      // Get the account to check ownership
      const { data: existing } = await supabaseClient
        .from('company_email_accounts')
        .select('company_id, *')
        .eq('id', resourceId)
        .single();

      if (!existing) {
        return jsonError(404, 'Cuenta no encontrada', req);
      }

      const companyId = existing.company_id;
      const role = await getUserCompanyRole(supabaseClient, userId, companyId);
      if (role !== 'owner' && role !== 'admin') {
        return jsonError(403, 'Solo owners y admins pueden modificar cuentas', req);
      }

      const body = await req.json();
      const { display_name, ses_from_email, ses_iam_role_arn, is_primary, domain, smtp_host, smtp_port, smtp_user, smtp_password, oauth_client_id, oauth_client_secret, oauth_refresh_token, auth_method, iam_access_key_id, aws_secret_key } = body;

      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (display_name !== undefined) {
        updateData['display_name'] = sanitizeString(display_name, 255);
      }
      // If domain changes, update both email and ses_from_email accordingly
      if (domain !== undefined) {
        const domainRx = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}\.[a-zA-Z]{2,}$/;
        const cleanDomain = domain.trim().toLowerCase();
        if (domainRx.test(cleanDomain)) {
          updateData['email'] = `noreply@${cleanDomain}`;
          updateData['ses_from_email'] = `noreply@${cleanDomain}`;
        }
      }
      if (ses_from_email !== undefined) {
        updateData['ses_from_email'] = ses_from_email ? sanitizeEmail(ses_from_email) : null;
      }
      if (ses_iam_role_arn !== undefined) {
        updateData['ses_iam_role_arn'] = ses_iam_role_arn ? sanitizeString(ses_iam_role_arn, 500) : null;
      }
      if (iam_access_key_id !== undefined) {
        updateData['iam_access_key_id'] = iam_access_key_id ? sanitizeString(iam_access_key_id, 255) : null;
      }
      if (aws_secret_key !== undefined && aws_secret_key) {
        const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
        const { data: encKey } = await supabaseAdmin.rpc('encrypt_text', { plaintext: aws_secret_key, key: encryptionKey });
        if (encKey) updateData['smtp_encrypted_password'] = encKey;
      }
      if (is_primary !== undefined && is_primary === true) {
        // Unset other primaries first
        await supabaseClient
          .from('company_email_accounts')
          .update({ is_primary: false })
          .eq('company_id', companyId)
          .eq('is_primary', true);
        updateData['is_primary'] = true;
      }

      // SMTP credentials
      if (smtp_host !== undefined) updateData['smtp_host'] = smtp_host ? sanitizeString(smtp_host, 255) : null;
      if (smtp_port !== undefined) updateData['smtp_port'] = typeof smtp_port === 'number' ? smtp_port : null;
      if (smtp_user !== undefined) updateData['smtp_user'] = smtp_user ? sanitizeString(smtp_user, 255) : null;
      if (smtp_password !== undefined && smtp_password) {
        // Encrypt SMTP password before storing
        const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
        const { data: encPw } = await supabaseAdmin.rpc('encrypt_text', { plaintext: smtp_password, key: encryptionKey });
        if (encPw) updateData['smtp_encrypted_password'] = encPw;
      }

      // OAuth2 credentials
      if (oauth_client_id !== undefined && oauth_client_id) {
        const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
        const { data: encClientId } = await supabaseAdmin.rpc('encrypt_text', { plaintext: oauth_client_id, key: encryptionKey });
        if (encClientId) updateData['oauth_client_id'] = encClientId;
      }
      if (oauth_client_secret !== undefined && oauth_client_secret) {
        const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
        const { data: encClientSecret } = await supabaseAdmin.rpc('encrypt_text', { plaintext: oauth_client_secret, key: encryptionKey });
        if (encClientSecret) updateData['oauth_client_secret'] = encClientSecret;
      }
      if (oauth_refresh_token !== undefined && oauth_refresh_token) {
        const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
        const { data: encRefresh } = await supabaseAdmin.rpc('encrypt_text', { plaintext: oauth_refresh_token, key: encryptionKey });
        if (encRefresh) updateData['oauth_refresh_token'] = encRefresh;
      }
      if (auth_method !== undefined) {
        updateData['auth_method'] = auth_method;
      }

      // Validate at least one complete auth method exists
      const finalUpdate = { ...existing, ...updateData };
      const hasPasswordAuth = !!(finalUpdate.smtp_host && finalUpdate.smtp_user && finalUpdate.smtp_encrypted_password);
      const hasOAuth = !!(finalUpdate.oauth_refresh_token && finalUpdate.oauth_client_id && finalUpdate.oauth_client_secret);
      if (!hasPasswordAuth && !hasOAuth) {
        return jsonError(400, 'Se requiere al menos un método de autenticación completo (SMTP u OAuth)', req);
      }

      const { data: account, error } = await supabaseClient
        .from('company_email_accounts')
        .update(updateData)
        .eq('id', resourceId)
        .select()
        .single();

      if (error) throw error;
      return jsonSuccess(200, account, req);
    }

    // ── DELETE /company-email-accounts/:id ───────────────────────────────────
    if (method === 'DELETE' && resourceId) {
      if (!isValidUUID(resourceId)) {
        return jsonError(400, 'ID de cuenta inválido', req);
      }

      const { data: existing } = await supabaseClient
        .from('company_email_accounts')
        .select('company_id, is_primary')
        .eq('id', resourceId)
        .single();

      if (!existing) {
        return jsonError(404, 'Cuenta no encontrada', req);
      }

      const companyId = existing.company_id;
      const role = await getUserCompanyRole(supabaseClient, userId, companyId);
      if (role !== 'owner' && role !== 'admin') {
        return jsonError(403, 'Solo owners y admins pueden eliminar cuentas', req);
      }

      // Soft delete: set is_active=false
      const { data: account, error } = await supabaseClient
        .from('company_email_accounts')
        .update({ is_active: false, is_primary: false, updated_at: new Date().toISOString() })
        .eq('id', resourceId)
        .select()
        .single();

      if (error) throw error;

      // If deleted was primary, set another account as primary
      if (existing.is_primary) {
        await supabaseClient
          .from('company_email_accounts')
          .update({ is_primary: true })
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1);
      }

      return jsonSuccess(200, { message: 'Cuenta desactivada correctamente', account }, req);
    }

    // ── POST /company-email-accounts/:id/verify ──────────────────────────────
    if (method === 'POST' && resourceId) {
      if (!isValidUUID(resourceId)) {
        return jsonError(400, 'ID de cuenta inválido', req);
      }

      const { data: account } = await supabaseClient
        .from('company_email_accounts')
        .select('company_id, email, ses_from_email, is_verified')
        .eq('id', resourceId)
        .single();

      if (!account) {
        return jsonError(404, 'Cuenta no encontrada', req);
      }

      const companyId = account.company_id;
      const role = await getUserCompanyRole(supabaseClient, userId, companyId);
      if (role !== 'owner' && role !== 'admin') {
        return jsonError(403, 'Solo owners y admins pueden verificar cuentas', req);
      }

      const emailForVerification = account.ses_from_email || account.email;

      // In a real implementation, this would trigger AWS SES domain verification
      // via the AWS SDK. For now, we return the DNS records the user must add.
      const dnsRecords = generateSESVerificationDNS(emailForVerification);

      // Get existing verification records
      const { data: verifications } = await supabaseClient
        .from('company_email_verification')
        .select('*')
        .eq('email_account_id', resourceId)
        .order('verification_type', { ascending: true });

      return jsonSuccess(200, {
        message: 'Registros DNS necesarios para verificar el dominio',
        email: emailForVerification,
        dns_records: dnsRecords,
        verifications: verifications ?? [],
      }, req);
    }

    return jsonError(404, 'Ruta no encontrada', req);
  } catch (error: any) {
    console.error('[company-email-accounts] Error:', error?.message, error?.stack);
    return jsonError(error.status || 500, error.message || 'Error interno del servidor', req);
  }
});

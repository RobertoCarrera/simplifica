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
  ses_from_email: string | null;
  ses_iam_role_arn: string | null;
  is_verified: boolean;
  verified_at: string | null;
  is_active: boolean;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
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

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthUser(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('Missing Authorization header');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized: invalid or expired token');
  return user;
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

function jsonSuccess(status: number, data: unknown, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { ...getCorsHeaders({ headers: corsHeaders } as unknown as Request), 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, error: string, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...getCorsHeaders({ headers: corsHeaders } as unknown as Request), 'Content-Type': 'application/json' },
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
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  // Rate limiting: 30 req/min per IP
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
        return jsonSuccess(200, []);
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
      return jsonSuccess(200, accounts ?? []);
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
        return jsonError(403, 'Solo superadmins pueden ver dominios de Route53');
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

        return jsonSuccess(200, domains);
      } catch (err) {
        console.error('[company-email-accounts] Route53 error:', err);
        return jsonError(502, 'Error al obtener dominios de Route53');
      }
    }

    // ── POST /company-email-accounts ─────────────────────────────────────────
    if (method === 'POST' && !resourceId) {
      // Get user's companies to find the primary one
      const { data: memberData } = await supabaseClient
        .from('company_members')
        .select('company_id, role')
        .eq('user_id', userId);

      const companyIds = memberData?.map((m: { company_id: string; role?: string }) => m.company_id) ?? [];
      if (companyIds.length === 0) {
        return jsonError(403, 'No tienes acceso a ninguna empresa');
      }

      const companyId = companyIds[0];
      const role = memberData?.find((m: { company_id: string; role?: string }) => m.company_id === companyId)?.role;

      if (role !== 'owner' && role !== 'admin') {
        return jsonError(403, 'Solo owners y admins pueden crear cuentas de email');
      }

      const body = await req.json();
      const { domain, display_name } = body;

      // Validate domain
      const domainRx = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}\.[a-zA-Z]{2,}$/;
      const cleanDomain = typeof domain === 'string' ? domain.trim().toLowerCase() : '';
      if (!cleanDomain || !domainRx.test(cleanDomain)) {
        return jsonError(400, 'Dominio inválido');
      }

      // Auto-calculate email from domain
      const cleanEmail = `noreply@${cleanDomain}`;
      const cleanDisplayName = display_name ? sanitizeString(display_name, 255) : null;
      const cleanProvider = 'ses';
      // SES IAM Role ARN comes from environment secrets (system-wide config)
      const sesIamRoleArn = Deno.env.get('SES_IAM_ROLE_ARN') ?? '';

      // Check for duplicate email in same company
      const { data: existing } = await supabaseClient
        .from('company_email_accounts')
        .select('id')
        .eq('company_id', companyId)
        .eq('email', cleanEmail)
        .single();

      if (existing) {
        return jsonError(409, 'Ya existe una cuenta con este email para tu empresa');
      }

      // Check if this will be the first (make it primary)
      const { count } = await supabaseClient
        .from('company_email_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);

      const isFirst = (count ?? 0) === 0;

      const insertData = {
        company_id: companyId,
        email: cleanEmail,
        display_name: cleanDisplayName,
        provider: cleanProvider,
        ses_from_email: cleanEmail,
        ses_iam_role_arn: sesIamRoleArn,
        is_verified: false,
        is_active: true,
        is_primary: isFirst,
      };

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

      return jsonSuccess(201, account);
    }

    // ── PATCH /company-email-accounts/:id ────────────────────────────────────
    if (method === 'PATCH' && resourceId) {
      if (!isValidUUID(resourceId)) {
        return jsonError(400, 'ID de cuenta inválido');
      }

      // Get the account to check ownership
      const { data: existing } = await supabaseClient
        .from('company_email_accounts')
        .select('company_id, *')
        .eq('id', resourceId)
        .single();

      if (!existing) {
        return jsonError(404, 'Cuenta no encontrada');
      }

      const companyId = existing.company_id;
      const role = await getUserCompanyRole(supabaseClient, userId, companyId);
      if (role !== 'owner' && role !== 'admin') {
        return jsonError(403, 'Solo owners y admins pueden modificar cuentas');
      }

      const body = await req.json();
      const { display_name, ses_from_email, ses_iam_role_arn, is_primary, domain } = body;

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
      if (is_primary !== undefined && is_primary === true) {
        // Unset other primaries first
        await supabaseClient
          .from('company_email_accounts')
          .update({ is_primary: false })
          .eq('company_id', companyId)
          .eq('is_primary', true);
        updateData['is_primary'] = true;
      }

      const { data: account, error } = await supabaseClient
        .from('company_email_accounts')
        .update(updateData)
        .eq('id', resourceId)
        .select()
        .single();

      if (error) throw error;
      return jsonSuccess(200, account);
    }

    // ── DELETE /company-email-accounts/:id ───────────────────────────────────
    if (method === 'DELETE' && resourceId) {
      if (!isValidUUID(resourceId)) {
        return jsonError(400, 'ID de cuenta inválido');
      }

      const { data: existing } = await supabaseClient
        .from('company_email_accounts')
        .select('company_id, is_primary')
        .eq('id', resourceId)
        .single();

      if (!existing) {
        return jsonError(404, 'Cuenta no encontrada');
      }

      const companyId = existing.company_id;
      const role = await getUserCompanyRole(supabaseClient, userId, companyId);
      if (role !== 'owner' && role !== 'admin') {
        return jsonError(403, 'Solo owners y admins pueden eliminar cuentas');
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

      return jsonSuccess(200, { message: 'Cuenta desactivada correctamente', account });
    }

    // ── POST /company-email-accounts/:id/verify ──────────────────────────────
    if (method === 'POST' && resourceId) {
      if (!isValidUUID(resourceId)) {
        return jsonError(400, 'ID de cuenta inválido');
      }

      const { data: account } = await supabaseClient
        .from('company_email_accounts')
        .select('company_id, email, ses_from_email, is_verified')
        .eq('id', resourceId)
        .single();

      if (!account) {
        return jsonError(404, 'Cuenta no encontrada');
      }

      const companyId = account.company_id;
      const role = await getUserCompanyRole(supabaseClient, userId, companyId);
      if (role !== 'owner' && role !== 'admin') {
        return jsonError(403, 'Solo owners y admins pueden verificar cuentas');
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
      });
    }

    return jsonError(404, 'Ruta no encontrada');
  } catch (error: any) {
    console.error('[company-email-accounts] Error:', error?.message, error?.stack);
    return jsonError(error.status || 500, error.message || 'Error interno del servidor');
  }
});

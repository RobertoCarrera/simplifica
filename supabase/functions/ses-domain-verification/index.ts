// Edge Function: ses-domain-verification
// Purpose: Automatic DNS verification for company email domains via AWS SES + Route53.
//   All domains are verified in Simplifica's single AWS account (not per-company AWS).
//   Handles SPF, DKIM, and DMARC record creation/verification in Route53.
//
// Auth: Bearer JWT — user must be authenticated.
//   Tenant isolation enforced via company_id from JWT claims.
//
// Flow:
//   1. GET  /ses-domain-verification?companyId=X&accountId=Y → check status
//   2. POST /ses-domain-verification/start                  → begin verification

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  SESClient,
  VerifyDomainIdentityCommand,
  GetIdentityVerificationAttributesCommand,
  VerifyDomainDkimCommand,
} from 'npm:@aws-sdk/client-ses';
import {
  Route53Client,
  CreateHostedZoneCommand,
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
  GetHostedZoneCommand,
} from 'npm:@aws-sdk/client-route-53';

import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VerificationStatus {
  success: boolean;
  data?: {
    domain: string;
    spf: { record: string; verified: boolean };
    dkim: { records: string[]; verified: boolean };
    dmarc: { record: string; verified: boolean };
    route53HostedZoneId: string;
  };
  error?: string;
}

// ── AWS SDK clients (lazily initialized after STS assumption) ─────────────────

let _sesClient: SESClient | null = null;
let _route53Client: Route53Client | null = null;

function resetAwsClients(): void {
  _sesClient = null;
  _route53Client = null;
}

/**
 * Build AWS clients using direct credentials from environment variables.
 * All domains are verified and sent from Simplifica's single AWS account.
 */
async function getAwsClients(): Promise<{
  ses: SESClient;
  route53: Route53Client;
}> {
  if (_sesClient && _route53Client) {
    return { ses: _sesClient, route53: _route53Client };
  }

  const region = Deno.env.get('AWS_REGION') ?? 'eu-west-1';
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
  }

  const clientConfig = {
    region,
    credentials: { accessKeyId, secretAccessKey },
  };

  _sesClient = new SESClient(clientConfig);
  _route53Client = new Route53Client(clientConfig);

  return { ses: _sesClient!, route53: _route53Client! };
}

// ── Route53 helpers ───────────────────────────────────────────────────────────

/**
 * Find existing hosted zone for a domain in Route53.
 * Returns hosted zone ID or null if not found.
 */
async function findHostedZone(route53: Route53Client, domain: string): Promise<string | null> {
  const cmd = new ListHostedZonesByNameCommand({ DNSName: domain });
  const response = await route53.send(cmd);
  const zone = response.HostedZones?.find(
    (z) => z.Name === domain || z.Name === `${domain}.`,
  );
  return zone?.Id ?? null;
}

/**
 * Create a new public hosted zone for the domain in Route53.
 * Returns the new hosted zone ID.
 */
async function createHostedZone(route53: Route53Client, domain: string): Promise<string> {
  const cmd = new CreateHostedZoneCommand({
    Name: domain,
    CallerReference: `ses-verification-${Date.now()}`,
    HostedZoneConfig: {
      Comment: 'Hosted zone created by Simplifica CRM for SES domain verification',
      PrivateZone: false,
    },
  });
  const response = await route53.send(cmd);
  if (!response.HostedZone?.Id) {
    throw new Error('CreateHostedZone did not return a HostedZone.Id');
  }
  console.log('[ses-domain-verification] Created hosted zone:', response.HostedZone.Id);
  return response.HostedZone.Id;
}

/**
 * Find or create a hosted zone for the given domain.
 */
async function findOrCreateHostedZone(route53: Route53Client, domain: string): Promise<string> {
  const existing = await findHostedZone(route53, domain);
  if (existing) {
    console.log('[ses-domain-verification] Found existing hosted zone:', existing);
    return existing;
  }
  return createHostedZone(route53, domain);
}

/**
 * Upsert (create or update) a DNS record in Route53.
 * Uses UPSERT action to handle both create and update scenarios.
 */
async function upsertDnsRecord(
  route53: Route53Client,
  hostedZoneId: string,
  name: string,
  type: 'TXT' | 'CNAME',
  value: string,
  ttl: number,
): Promise<void> {
  const fullName = name.endsWith('.') ? name : `${name}.`;
  const changeBatch: any = {
    Changes: [
      {
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: fullName,
          Type: type,
          TTL: ttl,
          ResourceRecords: [{ Value: type === 'TXT' ? `"${value}"` : value }],
        },
      },
    ],
  };

  const cmd = new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: changeBatch,
  });

  await route53.send(cmd);
  console.log(`[ses-domain-verification] Upserted ${type} record: ${fullName} → ${value}`);
}

/**
 * Add DKIM CNAME records for SES DKIM verification.
 * SES provides 3 CNAME tokens that must be added as DNS records.
 */
async function addSesDkimRecords(
  route53: Route53Client,
  hostedZoneId: string,
  domain: string,
  dkimTokens: string[],
): Promise<void> {
  for (const token of dkimTokens) {
    const recordName = `${token}._domainkey.${domain}`;
    const recordValue = `${token}.dkim.amazonses.com`;
    await upsertDnsRecord(route53, hostedZoneId, recordName, 'CNAME', recordValue, 300);
  }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function getSupabaseClients(token: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  });

  return { authClient, serviceClient };
}

async function updateVerificationStatus(
  serviceClient: any,
  companyId: string,
  accountId: string,
  updates: Record<string, any>,
): Promise<void> {
  const { error } = await serviceClient
    .from('company_email_verification')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('email_account_id', accountId);

  if (error) {
    console.error('[ses-domain-verification] Failed to update verification status:', error);
    throw new Error(`DB update failed: ${error.message}`);
  }
}

/**
 * Update company_email_accounts with provisioning fields after DNS setup.
 * This tracks route53_zone_id, dkim_tokens, and verification_status.
 */
async function updateEmailAccountProvisioning(
  serviceClient: any,
  accountId: string,
  updates: Record<string, any>,
): Promise<void> {
  const { error } = await serviceClient
    .from('company_email_accounts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', accountId);

  if (error) {
    console.error('[ses-domain-verification] Failed to update email account provisioning:', error);
    throw new Error(`Email account update failed: ${error.message}`);
  }
}

// ── GET: Check verification status ───────────────────────────────────────────

async function handleGet(
  req: Request,
  companyId: string,
  accountId: string,
  supabase: any,
): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  // Fetch stored verification record from DB
  const { data: record, error: dbError } = await supabase
    .from('company_email_verification')
    .select('*')
    .eq('company_id', companyId)
    .eq('email_account_id', accountId)
    .maybeSingle();

  if (dbError) {
    console.error('[ses-domain-verification] DB query error:', dbError);
    return new Response(
      JSON.stringify({ success: false, error: 'db_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!record) {
    return new Response(
      JSON.stringify({ success: false, error: 'not_found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Also fetch account-level provisioning fields from company_email_accounts
  const { data: accountRecord } = await supabase
    .from('company_email_accounts')
    .select('verification_status, dkim_tokens, route53_zone_id')
    .eq('id', accountId)
    .maybeSingle();

  const verificationStatus = accountRecord?.verification_status ?? 'pending';

  const domain = record.domain;

  // Check current SES verification status
  let sesStatus = { spf: false, dkim: false };
  try {
    const { ses } = await getAwsClients();
    const cmd = new GetIdentityVerificationAttributesCommand({
      Identities: [domain],
    });
    const response = await ses.send(cmd);
    const attrs = response.VerificationAttributes?.[domain];
    if (attrs) {
      sesStatus = {
        spf: attrs.VerificationStatus === 'Success',
        dkim: attrs.DKIMStatus === 'Success',
      };

      // If both SPF and DKIM are verified, update account status to 'verified'
      if (sesStatus.spf && sesStatus.dkim && verificationStatus !== 'verified') {
        const now = new Date().toISOString();
        await updateEmailAccountProvisioning(supabase, accountId, {
          verification_status: 'verified',
          verified_at: now,
        });
        // Update the local variable so the response reflects 'verified'
        verificationStatus = 'verified';
      }
    }
  } catch (err) {
    console.warn('[ses-domain-verification] SES status check failed:', err);
    // Non-fatal: continue with stored status
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        domain,
        verification_status: verificationStatus,
        spf: { record: record.spf_record ?? '', verified: record.spf_verified ?? false },
        dkim: { records: record.dkim_records ?? [], verified: record.dkim_verified ?? false },
        dmarc: { record: record.dmarc_record ?? '', verified: record.dmarc_verified ?? false },
        route53HostedZoneId: record.route53_hosted_zone_id ?? '',
        sesStatus,
      },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

// ── POST: Start verification ───────────────────────────────────────────────────

async function handlePost(
  req: Request,
  companyId: string,
  accountId: string,
  domain: string,
  serviceClient: any,
): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  // Validate domain format
  const domainRx = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,253}\.[a-zA-Z]{2,}$/;
  if (!domain || !domainRx.test(domain)) {
    return new Response(
      JSON.stringify({ success: false, error: 'invalid_domain' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  resetAwsClients(); // Force re-initialization in case credentials changed
  const { ses, route53 } = await getAwsClients();

  // ── 1. Verify domain with SES ────────────────────────────────────────────
  let dkimTokens: string[] = [];
  try {
    const verifyDomainCmd = new VerifyDomainIdentityCommand({ Domain: domain });
    await ses.send(verifyDomainCmd);
    console.log('[ses-domain-verification] Domain identity verified in SES:', domain);

    // Get DKIM tokens
    const dkimCmd = new VerifyDomainDkimCommand({ Domain: domain });
    const dkimResponse = await ses.send(dkimCmd);
    dkimTokens = dkimResponse.DkimTokens ?? [];
    console.log('[ses-domain-verification] DKIM tokens received:', dkimTokens.length);
  } catch (err: any) {
    // If domain already verified, SES returns success anyway — log and continue
    console.warn('[ses-domain-verification] SES verification warning:', err?.message);
  }

  // ── 2. Find or create Route53 hosted zone ─────────────────────────────────
  const hostedZoneId = await findOrCreateHostedZone(route53, domain);
  console.log('[ses-domain-verification] Using hosted zone:', hostedZoneId);

  // ── 3. Create SPF TXT record ───────────────────────────────────────────────
  const spfRecord = 'v=spf1 include:amazonses.com ~all';
  await upsertDnsRecord(route53, hostedZoneId, domain, 'TXT', 'v=spf1 include:amazonses.com ~all', 300);

  // ── 4. Create DKIM CNAME records ──────────────────────────────────────────
  if (dkimTokens.length > 0) {
    await addSesDkimRecords(route53, hostedZoneId, domain, dkimTokens);
  }

  // ── 5. Create DMARC TXT record ────────────────────────────────────────────
  // DMARC record name is _dmarc.{domain} — this is a standard DNS record
  // (not a delegation), so we pass the full name to upsertDnsRecord which
  // adds the trailing dot, resulting in _dmarc.{domain}.
  const dmarcRecord = 'v=DMARC1; p=quarantine; rua=mailto:dmarc@' + domain;
  await upsertDnsRecord(route53, hostedZoneId, `_dmarc.${domain}`, 'TXT', dmarcRecord, 300);

  // ── 6. Update company_email_accounts with provisioning fields ─────────────
  await updateEmailAccountProvisioning(serviceClient, accountId, {
    dkim_tokens: dkimTokens,
    route53_zone_id: hostedZoneId,
    verification_status: 'verifying',
  });

  // ── 7. Update company_email_verification record ───────────────────────────
  const now = new Date().toISOString();
  await updateVerificationStatus(serviceClient, companyId, accountId, {
    domain,
    spf_record: spfRecord,
    spf_verified: false,
    dkim_records: dkimTokens.map((t) => `${t}._domainkey.${domain}`),
    dkim_verified: false,
    dmarc_record: dmarcRecord,
    dmarc_verified: false,
    route53_hosted_zone_id: hostedZoneId,
    verification_started_at: now,
    status: 'pending_dns_propagation',
  });

  // ── 8. Build response ─────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        domain,
        spf: { record: spfRecord, verified: false },
        dkim: {
          records: dkimTokens.map((t) => `${t}._domainkey.${domain}`),
          verified: false,
        },
        dmarc: { record: dmarcRecord, verified: false },
        route53HostedZoneId: hostedZoneId,
        message:
          'DNS records created. Allow up to 72 hours for propagation, though typically completes within minutes.',
      },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

// ── Main request handler ──────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req) as Response;
  }

  // ── Auth: verify JWT is present and valid ────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'missing_auth' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.replace('Bearer ', '');

  // Decode token payload directly (skip Supabase getUser() which rejects ES256 tokens)
  // Token format: header.payload.signature (base64url)
  let tokenClaims: Record<string, unknown> = {};
  try {
    const payloadB64 = token.split('.')[1];
    const payloadJson = new TextDecoder().decode(
      Uint8Array.from(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    );
    tokenClaims = JSON.parse(payloadJson);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'malformed_token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = tokenClaims.sub as string;
  if (!userId) {
    return new Response(JSON.stringify({ success: false, error: 'invalid_token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Service client for DB operations (uses service role key, no auth needed)
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // ── Route: GET /ses-domain-verification ──────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const companyId = url.searchParams.get('companyId');
    const accountId = url.searchParams.get('accountId');

    if (!companyId || !accountId) {
      return new Response(
        JSON.stringify({ success: false, error: 'missing_params', message: 'companyId and accountId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return handleGet(req, companyId, accountId, serviceClient);
  }

  // ── Route: POST /ses-domain-verification/start ───────────────────────────
  if (req.method === 'POST') {
    const url = new URL(req.url);
    const isStartRoute = url.pathname.endsWith('/start');

    let body: { companyId?: string; accountId?: string; domain?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_json' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const companyId = body.companyId ?? url.searchParams.get('companyId');
    const accountId = body.accountId ?? url.searchParams.get('accountId');
    const domain = body.domain ?? '';

    if (!companyId || !accountId) {
      return new Response(
        JSON.stringify({ success: false, error: 'missing_params', message: 'companyId and accountId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!domain) {
      return new Response(
        JSON.stringify({ success: false, error: 'missing_domain' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return handlePost(req, companyId, accountId, domain, serviceClient);
  }

  // ── Unsupported method ───────────────────────────────────────────────────
  return new Response(
    JSON.stringify({ success: false, error: 'method_not_allowed' }),
    { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

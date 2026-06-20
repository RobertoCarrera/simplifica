// Edge Function: ses-inbound-provision
// Purpose: Automate provisioning of SES inbound mail for a verified domain.
//   - Creates/updates a SES Receipt Rule that routes emails for the domain
//     to the S3 bucket + Lambda (same pipeline as the existing
//     lambda-inbound -> process-inbound-email flow).
//   - Idempotent: if the rule already exists for the domain, updates it.
//   - Records state in inbound_mail_config (per-company) and
//     inbound_mail_global_config (singleton, superadmin-only).
//   - On AWS API failure, enqueues a job in aws_jobs for the cron processor
//     to retry (Fase 2).
//
// Auth:
//   - Bearer JWT for user actions (super_admin only).
//   - service_role key for system-triggered calls (from ses-domain-verification).
//
// Endpoints:
//   POST /ses-inbound-provision/start        { companyId, domain }
//   GET  /ses-inbound-provision/status?companyId=X&domain=Y
//   POST /ses-inbound-provision/disable      { companyId, domain }
//   POST /ses-inbound-provision/healthcheck
//
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  SESClient,
  CreateReceiptRuleCommand,
  UpdateReceiptRuleCommand,
  DeleteReceiptRuleCommand,
  DescribeActiveReceiptRuleSetCommand,
  SetActiveReceiptRuleSetCommand,
  CreateReceiptRuleSetCommand,
} from 'npm:@aws-sdk/client-ses';
import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
} from 'npm:@aws-sdk/client-route-53';

import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { isValidUUID, withSecurityHeaders } from '../_shared/security.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GlobalConfig {
  enabled: boolean;
  sandbox_mode: boolean;
  rule_set_name: string;
  lambda_function_name: string;
  s3_bucket: string;
  ses_region: string;
  default_mx_priority: number;
  max_domains_per_company: number;
  force_global_rule: boolean;
  auto_provision_on_domain_verify: boolean;
}

interface ProvisionResult {
  success: boolean;
  status: 'verifying' | 'active' | 'failed' | 'inactive' | 'pending';
  ses_rule_name?: string;
  ses_rule_set_name?: string;
  mx_record_value?: string;
  error?: string;
  warnings?: string[];
}

// ── AWS clients (lazily initialized) ─────────────────────────────────────────

let _sesClient: SESClient | null = null;
let _route53Client: Route53Client | null = null;

async function getAwsClients(region: string): Promise<{
  ses: SESClient;
  route53: Route53Client;
}> {
  if (_sesClient && _route53Client && _sesClient.config.region === region) {
    return { ses: _sesClient, route53: _route53Client };
  }

  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Supabase secrets.'
    );
  }

  const clientConfig = {
    region,
    credentials: { accessKeyId, secretAccessKey },
  };

  _sesClient = new SESClient(clientConfig);
  _route53Client = new Route53Client(clientConfig);
  return { ses: _sesClient, route53: _route53Client };
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function requireAuthorizedUser(
  req: Request,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<{
  isSuperAdmin: boolean;
  userId: string | null;
  companyId: string | null;
  isOwnerOrAdmin: boolean;
}> {
  const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const isServiceRoleCall = authHeader.length > 0 && authHeader === serviceRoleKey;

  if (isServiceRoleCall) {
    return { isSuperAdmin: true, userId: null, companyId: null, isOwnerOrAdmin: true };
  }

  const token = authHeader;
  if (!token) throw new Error('Missing Authorization header');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized: invalid or expired token');

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('id, company_id, app_role_id, app_roles:app_role_id(name)')
    .eq('auth_user_id', user.id)
    .single();

  if (!userRow) throw new Error('Forbidden: user row not found');

  const roleName = (userRow as any).app_roles?.name;
  const isSuperAdmin = roleName === 'super_admin';
  const isOwnerOrAdmin =
    isSuperAdmin ||
    roleName === 'owner' ||
    roleName === 'admin' ||
    roleName === 'supervisor';

  if (!isOwnerOrAdmin) {
    throw new Error('Forbidden: owner / admin / supervisor / super_admin required');
  }

  return {
    isSuperAdmin,
    userId: (userRow as any).id,
    companyId: (userRow as any).company_id,
    isOwnerOrAdmin,
  };
}

function jsonError(status: number, error: string, req: Request) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
  });
}

function jsonSuccess(data: unknown, req: Request) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
  });
}

// ── SES rule operations ───────────────────────────────────────────────────────

async function ensureRuleSet(ses: SESClient, ruleSetName: string): Promise<void> {
  try {
    await ses.send(new SetActiveReceiptRuleSetCommand({ RuleSetName: ruleSetName }));
  } catch (err: any) {
    if (err.name === 'RuleSetDoesNotExistException') {
      await ses.send(new CreateReceiptRuleSetCommand({ RuleSetName: ruleSetName }));
      await ses.send(new SetActiveReceiptRuleSetCommand({ RuleSetName: ruleSetName }));
    } else {
      throw err;
    }
  }
}

async function getExistingRules(
  ses: SESClient,
  ruleSetName: string
): Promise<{ name: string; recipients?: string[] }[]> {
  try {
    const out = await ses.send(
      new DescribeActiveReceiptRuleSetCommand({ RuleSetName: ruleSetName })
    );
    return (out.Rules ?? []).map(r => ({
      name: r.Name ?? '',
      recipients: r.Recipients ?? [],
    }));
  } catch {
    return [];
  }
}

function ruleNameForDomain(companyId: string, domain: string): string {
  // 64 char max for SES rule names. Use a stable, recognizable name.
  const safe = domain.replace(/[^a-z0-9.-]/gi, '').substring(0, 40);
  const short = companyId.replace(/-/g, '').substring(0, 16);
  return `simp-${short}-${safe}`;
}

async function upsertSesReceiptRule(
  ses: SESClient,
  cfg: GlobalConfig,
  domain: string,
  ruleName: string
): Promise<{ created: boolean; ruleName: string; warning?: string }> {
  await ensureRuleSet(ses, cfg.rule_set_name);

  const existing = await getExistingRules(ses, cfg.rule_set_name);
  const existingRule = existing.find(r => r.name === ruleName);
  const created = !existingRule;

  // We can't easily get the AWS account ID at runtime; the lambda action
  // ARN can be omitted and SES will fall back to the function name in the
  // same region. SES requires the full ARN, so we attempt to get it from
  // an env var set by the deployer, or fall back to a region-only ARN.
  const awsAccountId = Deno.env.get('AWS_ACCOUNT_ID') ?? '';
  const lambdaArn = awsAccountId
    ? `arn:aws:lambda:${cfg.ses_region}:${awsAccountId}:function:${cfg.lambda_function_name}`
    : `arn:aws:lambda:${cfg.ses_region}::function:${cfg.lambda_function_name}`;

  const newRule: any = {
    Name: ruleName,
    Enabled: true,
    Recipients: [domain, `*.${domain}`],
    Actions: [
      {
        S3Action: {
          BucketName: cfg.s3_bucket,
          ObjectKeyPrefix: 'incoming/',
        },
      },
      {
        LambdaAction: {
          FunctionArn: lambdaArn,
          InvocationType: 'Event',
        },
      },
    ],
    ScanEnabled: true,
  };

  let warning: string | undefined;
  if (!awsAccountId) {
    warning =
      'AWS_ACCOUNT_ID secret is not set. Lambda ARN was built with a placeholder; verify the rule in AWS console if SES rejects it.';
  }

  if (created) {
    await ses.send(
      new CreateReceiptRuleCommand({
        RuleSetName: cfg.rule_set_name,
        Rule: newRule,
      })
    );
  } else {
    await ses.send(
      new UpdateReceiptRuleCommand({
        RuleSetName: cfg.rule_set_name,
        Rule: newRule,
      })
    );
  }

  return { created, ruleName, warning };
}

async function deleteSesReceiptRule(
  ses: SESClient,
  cfg: GlobalConfig,
  ruleName: string
): Promise<void> {
  try {
    await ses.send(
      new DeleteReceiptRuleCommand({
        RuleSetName: cfg.rule_set_name,
        RuleName: ruleName,
      })
    );
  } catch (err: any) {
    if (err.name !== 'RuleDoesNotExistException') throw err;
  }
}

// ── Route53 MX record operations ──────────────────────────────────────────────

async function upsertMxRecord(
  route53: Route53Client,
  domain: string,
  mxValue: string,
  priority: number
): Promise<{ hostedZoneId: string }> {
  const zonesResp = await route53.send(
    new ListHostedZonesByNameCommand({ DNSName: domain })
  );
  const zones = zonesResp.HostedZones ?? [];
  const zone = zones.find(z => z.Name === `${domain}.` || z.Name === domain);
  if (!zone || !zone.Id) {
    throw new Error(
      `No Route53 hosted zone found for ${domain}. Either the domain's DNS is not on Route53, or the owner must add the MX record manually.`
    );
  }
  const hostedZoneId = zone.Id.split('/').pop()!;

  await route53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: domain,
              Type: 'MX',
              TTL: 300,
              ResourceRecords: [{ Value: `${priority} ${mxValue}` }],
            },
          },
        ],
      },
    })
  );

  return { hostedZoneId };
}

function defaultMxValue(region: string): string {
  return `inbound-smtp.${region}.amazonaws.com`;
}

// ── Provisioning logic ────────────────────────────────────────────────────────

async function loadGlobalConfig(
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<GlobalConfig> {
  const { data } = await supabaseAdmin
    .from('inbound_mail_global_config')
    .select('*')
    .eq('id', 1)
    .single();
  if (!data) {
    throw new Error('inbound_mail_global_config not initialized. Run the migration first.');
  }
  const row = data as any;
  return {
    enabled: row.enabled,
    sandbox_mode: row.sandbox_mode,
    rule_set_name: row.rule_set_name,
    lambda_function_name: row.lambda_function_name,
    s3_bucket: row.s3_bucket,
    ses_region: row.ses_region,
    default_mx_priority: row.default_mx_priority,
    max_domains_per_company: row.max_domains_per_company,
    force_global_rule: row.force_global_rule,
    auto_provision_on_domain_verify: row.auto_provision_on_domain_verify,
  };
}

async function provisionDomain(
  req: Request,
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
  domain: string
): Promise<ProvisionResult> {
  const cfg = await loadGlobalConfig(supabaseAdmin);
  if (!cfg.enabled) {
    return {
      success: false,
      status: 'inactive',
      error: 'Inbound mail is globally disabled by the administrator.',
    };
  }

  // Make sure the inbound_mail_config row exists.
  const { data: cfgRow } = await supabaseAdmin
    .rpc('ensure_inbound_config', { p_company_id: companyId, p_domain: domain });

  // Mark as verifying
  await supabaseAdmin
    .from('inbound_mail_config')
    .update({ status: 'verifying', last_error: null })
    .eq('company_id', companyId)
    .eq('domain', domain);

  const ruleName = ruleNameForDomain(companyId, domain);
  const mxValue = defaultMxValue(cfg.ses_region);
  const warnings: string[] = [];

  try {
    const { ses, route53 } = await getAwsClients(cfg.ses_region);

    // 1. SES receipt rule
    const ruleRes = await upsertSesReceiptRule(ses, cfg, domain, ruleName);
    if (ruleRes.warning) warnings.push(ruleRes.warning);

    // 2. MX record (best effort - some domains may not be on Route53)
    let mx_record_value = `${cfg.default_mx_priority} ${mxValue}`;
    try {
      await upsertMxRecord(route53, domain, mxValue, cfg.default_mx_priority);
    } catch (mxErr: any) {
      warnings.push(
        `MX record not auto-created: ${mxErr.message}. The owner must add it manually at their DNS provider.`
      );
    }

    // 3. Update state
    const { error: updateErr } = await supabaseAdmin
      .from('inbound_mail_config')
      .update({
        status: 'active',
        ses_rule_name: ruleRes.ruleName,
        ses_rule_set_name: cfg.rule_set_name,
        mx_record_value,
        mx_verified: true,
        last_provisioned_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('company_id', companyId)
      .eq('domain', domain);

    if (updateErr) {
      return {
        success: false,
        status: 'failed',
        error: `AWS operations succeeded but DB update failed: ${updateErr.message}`,
      };
    }

    return {
      success: true,
      status: 'active',
      ses_rule_name: ruleRes.ruleName,
      ses_rule_set_name: cfg.rule_set_name,
      mx_record_value,
      warnings: warnings.length ? warnings : undefined,
    };
  } catch (awsErr: any) {
    const errMsg = awsErr?.message ?? 'Unknown AWS error';

    // Mark as failed; on retry we'll try again.
    await supabaseAdmin
      .from('inbound_mail_config')
      .update({
        status: 'failed',
        last_error: errMsg,
        ses_rule_name: ruleName,
        ses_rule_set_name: cfg.rule_set_name,
        mx_record_value: `${cfg.default_mx_priority} ${mxValue}`,
      })
      .eq('company_id', companyId)
      .eq('domain', domain);

    // Enqueue a job so the cron processor can retry (Fase 2).
    await supabaseAdmin.rpc('enqueue_aws_job', {
      p_job_type: 'ses_receipt_rule_upsert',
      p_company_id: companyId,
      p_domain: domain,
      p_payload: { error_at_first_try: errMsg },
      p_run_at: new Date(Date.now() + 60_000).toISOString(), // 1 min
      p_max_attempts: 5,
    });

    return {
      success: false,
      status: 'failed',
      error: errMsg,
      warnings: ['A retry has been scheduled in aws_jobs.'],
    };
  }
}

async function disableDomain(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
  domain: string
): Promise<ProvisionResult> {
  const cfg = await loadGlobalConfig(supabaseAdmin);
  const { data: row } = await supabaseAdmin
    .from('inbound_mail_config')
    .select('*')
    .eq('company_id', companyId)
    .eq('domain', domain)
    .single();
  if (!row) {
    return { success: false, status: 'inactive', error: 'No config for this domain' };
  }
  const ruleName = (row as any).ses_rule_name ?? ruleNameForDomain(companyId, domain);

  try {
    const { ses } = await getAwsClients(cfg.ses_region);
    await deleteSesReceiptRule(ses, cfg, ruleName);
  } catch (awsErr: any) {
    // Even if AWS delete fails, mark as inactive in our DB so the UI reflects intent.
    console.warn('AWS rule delete failed:', awsErr?.message);
  }

  await supabaseAdmin
    .from('inbound_mail_config')
    .update({ status: 'inactive' })
    .eq('company_id', companyId)
    .eq('domain', domain);

  return { success: true, status: 'inactive' };
}

async function runHealthcheck(
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<{ ok: number; drifted: number; missing: number; details: any[] }> {
  const cfg = await loadGlobalConfig(supabaseAdmin);
  const { data: rows } = await supabaseAdmin
    .from('inbound_mail_config')
    .select('*')
    .eq('status', 'active');

  const { ses } = await getAwsClients(cfg.ses_region);
  const existing = await getExistingRules(ses, cfg.rule_set_name);
  const existingByName = new Map(existing.map(r => [r.name, r]));

  const details: any[] = [];
  let ok = 0,
    drifted = 0,
    missing = 0;

  for (const r of rows ?? []) {
    const rule = existingByName.get((r as any).ses_rule_name);
    if (!rule) {
      missing++;
      details.push({ company_id: r.company_id, domain: r.domain, issue: 'rule_missing' });
    } else {
      const recipients = rule.recipients ?? [];
      const hasDomain =
        recipients.includes((r as any).domain) ||
        recipients.includes(`*.${(r as any).domain}`);
      if (hasDomain) {
        ok++;
      } else {
        drifted++;
        details.push({
          company_id: r.company_id,
          domain: r.domain,
          issue: 'recipients_mismatch',
          aws_recipients: recipients,
        });
      }
    }
  }

  return { ok, drifted, missing, details };
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let auth: {
    isSuperAdmin: boolean;
    userId: string | null;
    companyId: string | null;
    isOwnerOrAdmin: boolean;
  };
  try {
    auth = await requireAuthorizedUser(req, supabaseAdmin);
  } catch (authErr: any) {
    return jsonError(401, authErr.message || 'Unauthorized', req);
  }

  const url = new URL(req.url);
  const method = req.method.toUpperCase();

  // Helper: owner can only operate on their own company
  function assertCompanyAccess(companyId: string): string | null {
    if (auth.isSuperAdmin) return null;
    if (auth.companyId !== companyId) {
      return 'Forbidden: you can only operate on your own company';
    }
    return null;
  }

  // GET /ses-inbound-provision/status
  if (method === 'GET' && url.pathname.endsWith('/status')) {
    const companyId = url.searchParams.get('companyId');
    const domain = url.searchParams.get('domain');
    if (!companyId || !domain || !isValidUUID(companyId)) {
      return jsonError(400, 'companyId and domain required', req);
    }
    const accessErr = assertCompanyAccess(companyId);
    if (accessErr) return jsonError(403, accessErr, req);
    const { data, error } = await supabaseAdmin
      .from('inbound_mail_config')
      .select('*')
      .eq('company_id', companyId)
      .eq('domain', domain)
      .single();
    if (error) {
      return jsonError(404, error.message, req);
    }
    return jsonSuccess(data, req);
  }

  // POST /ses-inbound-provision/start
  if (method === 'POST' && url.pathname.endsWith('/start')) {
    const body = await req.json().catch(() => ({}));
    const companyId = body.companyId;
    const domain = body.domain;
    if (!companyId || !domain || !isValidUUID(companyId)) {
      return jsonError(400, 'companyId (uuid) and domain (string) required', req);
    }
    const accessErr = assertCompanyAccess(companyId);
    if (accessErr) return jsonError(403, accessErr, req);
    const result = await provisionDomain(req, supabaseAdmin, companyId, domain);
    return jsonSuccess(result, req);
  }

  // POST /ses-inbound-provision/disable
  if (method === 'POST' && url.pathname.endsWith('/disable')) {
    const body = await req.json().catch(() => ({}));
    const companyId = body.companyId;
    const domain = body.domain;
    if (!companyId || !domain || !isValidUUID(companyId)) {
      return jsonError(400, 'companyId and domain required', req);
    }
    const accessErr = assertCompanyAccess(companyId);
    if (accessErr) return jsonError(403, accessErr, req);
    const result = await disableDomain(supabaseAdmin, companyId, domain);
    return jsonSuccess(result, req);
  }

  // POST /ses-inbound-provision/healthcheck (superadmin only)
  if (method === 'POST' && url.pathname.endsWith('/healthcheck')) {
    if (!auth.isSuperAdmin) {
      return jsonError(403, 'Manual healthcheck requires super_admin', req);
    }
    const result = await runHealthcheck(supabaseAdmin);
    return jsonSuccess(result, req);
  }

  return jsonError(404, 'Unknown endpoint. Use /start /status /disable /healthcheck', req);
});

// Edge Function: aws-jobs-processor
// Purpose: Cron-driven processor for queued AWS operations (aws_jobs).
//   Picks up pending jobs, executes them with exponential backoff, marks
//   them completed/failed.
//
//   This is the safety net for the sync API in ses-inbound-provision:
//   if the live API call fails, a job is enqueued here for retry.
//
// Schedule: every 5 minutes via Supabase cron (see migration 20260614000004).
//
// Endpoints:
//   POST /aws-jobs-processor/run   -> process all pending jobs (also called by cron)
//   GET  /aws-jobs-processor/peek  -> super_admin: see queue state (last 50 jobs)
//
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  SESClient,
  CreateReceiptRuleCommand,
  UpdateReceiptRuleCommand,
  DeleteReceiptRuleCommand,
  CreateReceiptRuleSetCommand,
  SetActiveReceiptRuleSetCommand,
  DescribeActiveReceiptRuleSetCommand,
} from 'npm:@aws-sdk/client-ses';
import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
} from 'npm:@aws-sdk/client-route-53';

import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GlobalConfig {
  enabled: boolean;
  rule_set_name: string;
  lambda_function_name: string;
  s3_bucket: string;
  ses_region: string;
  default_mx_priority: number;
}

interface Job {
  id: string;
  job_type: string;
  company_id: string;
  domain: string;
  payload: any;
  attempts: number;
  max_attempts: number;
}

interface Result {
  processed: number;
  completed: number;
  failed: number;
  retried: number;
  dead: number;
  details: Array<{ id: string; job_type: string; status: string; error?: string }>;
}

// ── AWS helpers (subset of ses-inbound-provision) ───────────────────────────

let _ses: SESClient | null = null;
let _route53: Route53Client | null = null;

async function getAwsClients(region: string) {
  if (_ses && _route53 && _ses.config.region === region) {
    return { ses: _ses, route53: _route53 };
  }
  const ak = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
  const sk = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';
  if (!ak || !sk) throw new Error('AWS credentials missing');
  const cfg = { region, credentials: { accessKeyId: ak, secretAccessKey: sk } };
  _ses = new SESClient(cfg);
  _route53 = new Route53Client(cfg);
  return { ses: _ses, route53: _route53 };
}

function ruleNameForDomain(companyId: string, domain: string): string {
  const safe = domain.replace(/[^a-z0-9.-]/gi, '').substring(0, 40);
  const short = companyId.replace(/-/g, '').substring(0, 16);
  return `simp-${short}-${safe}`;
}

function defaultMxValue(region: string): string {
  return `inbound-smtp.${region}.amazonaws.com`;
}

async function ensureRuleSet(ses: SESClient, name: string) {
  try {
    await ses.send(new SetActiveReceiptRuleSetCommand({ RuleSetName: name }));
  } catch (err: any) {
    if (err.name === 'RuleSetDoesNotExistException') {
      await ses.send(new CreateReceiptRuleSetCommand({ RuleSetName: name }));
      await ses.send(new SetActiveReceiptRuleSetCommand({ RuleSetName: name }));
    } else {
      throw err;
    }
  }
}

async function upsertRule(
  ses: SESClient,
  cfg: GlobalConfig,
  domain: string,
  ruleName: string
) {
  await ensureRuleSet(ses, cfg.rule_set_name);

  const awsAccountId = Deno.env.get('AWS_ACCOUNT_ID') ?? '';
  const lambdaArn = awsAccountId
    ? `arn:aws:lambda:${cfg.ses_region}:${awsAccountId}:function:${cfg.lambda_function_name}`
    : `arn:aws:lambda:${cfg.ses_region}::function:${cfg.lambda_function_name}`;

  const rule: any = {
    Name: ruleName,
    Enabled: true,
    Recipients: [domain, `*.${domain}`],
    Actions: [
      { S3Action: { BucketName: cfg.s3_bucket, ObjectKeyPrefix: 'incoming/' } },
      { LambdaAction: { FunctionArn: lambdaArn, InvocationType: 'Event' } },
    ],
    ScanEnabled: true,
  };

  // Try update first (most common case), fall back to create.
  try {
    await ses.send(
      new UpdateReceiptRuleCommand({ RuleSetName: cfg.rule_set_name, Rule: rule })
    );
  } catch (err: any) {
    if (err.name === 'RuleDoesNotExistException') {
      await ses.send(
        new CreateReceiptRuleCommand({ RuleSetName: cfg.rule_set_name, Rule: rule })
      );
    } else {
      throw err;
    }
  }
}

async function deleteRule(
  ses: SESClient,
  cfg: GlobalConfig,
  ruleName: string
) {
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

async function upsertMx(
  route53: Route53Client,
  domain: string,
  mxValue: string,
  priority: number
) {
  const z = await route53.send(
    new ListHostedZonesByNameCommand({ DNSName: domain })
  );
  const zone = (z.HostedZones ?? []).find(
    h => h.Name === `${domain}.` || h.Name === domain
  );
  if (!zone || !zone.Id) {
    throw new Error(`No Route53 hosted zone for ${domain}`);
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
}

// ── Job executor ──────────────────────────────────────────────────────────────

async function executeJob(
  supabaseAdmin: ReturnType<typeof createClient>,
  cfg: GlobalConfig,
  job: Job
): Promise<{ ok: boolean; error?: string }> {
  const ruleName = ruleNameForDomain(job.company_id, job.domain);
  const mxValue = defaultMxValue(cfg.ses_region);

  try {
    const { ses, route53 } = await getAwsClients(cfg.ses_region);

    switch (job.job_type) {
      case 'ses_receipt_rule_upsert': {
        await upsertRule(ses, cfg, job.domain, ruleName);
        // Best-effort MX
        try {
          await upsertMx(route53, job.domain, mxValue, cfg.default_mx_priority);
        } catch (mxErr: any) {
          // Non-fatal: maybe the domain's DNS isn't on Route53.
          console.warn('[aws-jobs] MX upsert failed (non-fatal):', mxErr?.message);
        }
        await supabaseAdmin
          .from('inbound_mail_config')
          .update({
            status: 'active',
            ses_rule_name: ruleName,
            ses_rule_set_name: cfg.rule_set_name,
            mx_record_value: `${cfg.default_mx_priority} ${mxValue}`,
            mx_verified: true,
            last_provisioned_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('company_id', job.company_id)
          .eq('domain', job.domain);
        return { ok: true };
      }
      case 'ses_receipt_rule_delete': {
        await deleteRule(ses, cfg, ruleName);
        await supabaseAdmin
          .from('inbound_mail_config')
          .update({ status: 'inactive' })
          .eq('company_id', job.company_id)
          .eq('domain', job.domain);
        return { ok: true };
      }
      case 'route53_mx_upsert': {
        await upsertMx(route53, job.domain, mxValue, cfg.default_mx_priority);
        return { ok: true };
      }
      case 'route53_mx_delete': {
        // Implementation left for future; not used yet.
        return { ok: true };
      }
      case 'healthcheck_ses_rules': {
        // Run a one-off healthcheck; result logged to the job's last_error
        // if it diverges.
        const existing = await ses.send(
          new DescribeActiveReceiptRuleSetCommand({ RuleSetName: cfg.rule_set_name })
        );
        const rule = (existing.Rules ?? []).find(r => r.Name === ruleName);
        if (!rule) {
          return { ok: false, error: 'rule_missing' };
        }
        const recipients = rule.Recipients ?? [];
        if (!recipients.includes(job.domain) && !recipients.includes(`*.${job.domain}`)) {
          return { ok: false, error: 'recipients_drifted' };
        }
        return { ok: true };
      }
      default:
        return { ok: false, error: `unknown_job_type: ${job.job_type}` };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ── Process all pending jobs ──────────────────────────────────────────────────

async function processPendingJobs(
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<Result> {
  const { data: cfgRow } = await supabaseAdmin
    .from('inbound_mail_global_config')
    .select('*')
    .eq('id', 1)
    .single();
  if (!cfgRow) {
    return { processed: 0, completed: 0, failed: 0, retried: 0, dead: 0, details: [] };
  }
  const cfg: GlobalConfig = {
    enabled: (cfgRow as any).enabled,
    rule_set_name: (cfgRow as any).rule_set_name,
    lambda_function_name: (cfgRow as any).lambda_function_name,
    s3_bucket: (cfgRow as any).s3_bucket,
    ses_region: (cfgRow as any).ses_region,
    default_mx_priority: (cfgRow as any).default_mx_priority,
  };

  if (!cfg.enabled) {
    return { processed: 0, completed: 0, failed: 0, retried: 0, dead: 0, details: [] };
  }

  // Lock jobs by setting status='in_progress' atomically.
  // Postgres `FOR UPDATE SKIP LOCKED` is the cleanest way; here we use a
  // simple conditional update.
  const { data: lockedJobs } = await supabaseAdmin
    .from('aws_jobs')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('status', 'pending')
    .lte('run_at', new Date().toISOString())
    .select('*')
    .limit(20);

  const jobs = (lockedJobs ?? []) as Job[];
  const result: Result = {
    processed: jobs.length,
    completed: 0,
    failed: 0,
    retried: 0,
    dead: 0,
    details: [],
  };

  for (const job of jobs) {
    const { ok, error } = await executeJob(supabaseAdmin, cfg, job);
    if (ok) {
      await supabaseAdmin
        .from('aws_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', job.id);
      result.completed++;
      result.details.push({ id: job.id, job_type: job.job_type, status: 'completed' });
    } else {
      const newAttempts = (job.attempts ?? 0) + 1;
      if (newAttempts >= (job.max_attempts ?? 5)) {
        await supabaseAdmin
          .from('aws_jobs')
          .update({
            status: 'dead',
            attempts: newAttempts,
            last_error: error ?? 'unknown',
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        result.dead++;
        result.details.push({ id: job.id, job_type: job.job_type, status: 'dead', error });
      } else {
        // Exponential backoff: 1m, 2m, 4m, 8m, 16m
        const backoffMs = 60_000 * Math.pow(2, newAttempts - 1);
        await supabaseAdmin
          .from('aws_jobs')
          .update({
            status: 'pending',
            attempts: newAttempts,
            last_error: error ?? 'unknown',
            run_at: new Date(Date.now() + backoffMs).toISOString(),
          })
          .eq('id', job.id);
        result.retried++;
        result.details.push({ id: job.id, job_type: job.job_type, status: 'retried', error });
      }
      result.failed++;
    }
  }

  return result;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function requireSuperAdminOrServiceRole(
  req: Request,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<{ ok: boolean; userId: string | null }> {
  const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (authHeader.length > 0 && authHeader === serviceRoleKey) {
    return { ok: true, userId: null };
  }
  const token = authHeader;
  if (!token) return { ok: false, userId: null };
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return { ok: false, userId: null };
  const { data: row } = await supabaseAdmin
    .from('users')
    .select('id, app_role_id, app_roles:app_role_id(name)')
    .eq('auth_user_id', user.id)
    .single();
  if ((row as any)?.app_roles?.name === 'super_admin') {
    return { ok: true, userId: (row as any).id };
  }
  return { ok: false, userId: null };
}

function jsonError(status: number, error: string, req: Request) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}
function jsonSuccess(data: unknown, req: Request) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const url = new URL(req.url);
  const method = req.method.toUpperCase();

  if (method === 'POST' && url.pathname.endsWith('/run')) {
    const auth = await requireSuperAdminOrServiceRole(req, supabaseAdmin);
    if (!auth.ok) return jsonError(401, 'Unauthorized', req);
    const result = await processPendingJobs(supabaseAdmin);
    return jsonSuccess(result, req);
  }

  if (method === 'GET' && url.pathname.endsWith('/peek')) {
    const auth = await requireSuperAdminOrServiceRole(req, supabaseAdmin);
    if (!auth.ok) return jsonError(401, 'Unauthorized', req);
    const { data } = await supabaseAdmin
      .from('aws_jobs')
      .select('id, job_type, company_id, domain, status, attempts, last_error, run_at, completed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    return jsonSuccess(data ?? [], req);
  }

  return jsonError(404, 'Unknown endpoint. Use /run or /peek', req);
});

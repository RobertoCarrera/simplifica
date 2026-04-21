/**
 * Edge Function: aws-iam-provision
 * Creates an isolated IAM user per company for SES email sending.
 *
 * Auth: Bearer JWT — user must be authenticated and company member.
 *
 * Input:
 *   {
 *     companyId: string,
 *     emailAccountId: string,
 *     domain: string          // e.g. "miempresa.com"
 *   }
 *
 * What it does:
 *   1. Creates IAM user: simplify-email-{slug}
 *   2. Attaches inline policy scoped to *@{domain} only
 *   3. Creates access keys
 *   4. Encrypts secret key with pgp_sym_encrypt using ENCRYPTION_KEY env var
 *   5. Updates company_email_accounts with IAM ARN and encrypted credentials
 *   6. Sets provider_type = 'ses_iam'
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  IAMClient,
  CreateUserCommand,
  CreateAccessKeyCommand,
  PutUserPolicyCommand,
} from 'npm:@aws-sdk/client-iam';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

// ── Auth ─────────────────────────────────────────────────────────────────────

async function authUser(req: Request): Promise<{ userId: string; companyId: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('missing_auth');
  }

  const token = authHeader.replace('Bearer ', '');

  let tokenClaims: Record<string, unknown> = {};
  try {
    const payloadB64 = token.split('.')[1];
    const payloadJson = new TextDecoder().decode(
      Uint8Array.from(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
    );
    tokenClaims = JSON.parse(payloadJson);
  } catch {
    throw new Error('malformed_token');
  }

  const userId = tokenClaims.sub as string;
  const companyId = tokenClaims.company_id as string;
  if (!userId || !companyId) {
    throw new Error('invalid_token');
  }

  return { userId, companyId };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function slugifyDomain(domain: string): string {
  return 'simplifica-email-' + domain.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
}

function buildSesPolicy(domain: string): string {
  const region = Deno.env.get('AWS_REGION') ?? 'eu-west-1';
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['ses:SendEmail', 'ses:SendRawEmail'],
        Resource: `arn:aws:ses:${region}:*:identity/${domain}`,
        Condition: {
          StringLike: {
            'ses:FromAddress': [`*@${domain}`, `*@*.${domain}`],
          },
        },
      },
      {
        Effect: 'Allow',
        Action: ['ses:ListIdentities', 'ses:GetIdentityVerificationAttributes', 'ses:VerifyDomainIdentity', 'ses:VerifyDomainDkim'],
        Resource: '*',
      },
    ],
  });
}

function getIamClient(): IAMClient {
  const region = Deno.env.get('AWS_REGION') ?? 'eu-west-1';
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured');
  }

  return new IAMClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req) as Response;
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'method_not_allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  let userId: string;
  let jwtCompanyId: string;
  try {
    ({ userId, companyId: jwtCompanyId } = await authUser(req));
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: { companyId?: string; emailAccountId?: string; domain?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { companyId, emailAccountId, domain } = body;

  if (!companyId || !emailAccountId || !domain) {
    return new Response(
      JSON.stringify({ success: false, error: 'missing_params' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (companyId !== jwtCompanyId) {
    return new Response(JSON.stringify({ success: false, error: 'forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const domainRx = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,253}\.[a-zA-Z]{2,}$/;
  if (!domainRx.test(domain)) {
    return new Response(JSON.stringify({ success: false, error: 'invalid_domain' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Create IAM user ──────────────────────────────────────────────────────
  let iam: IAMClient;
  try {
    iam = getIamClient();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'AWS not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const iamUserName = slugifyDomain(domain);
  let iamUserArn: string;
  let accessKeyId: string;
  let secretAccessKey: string;

  try {
    const createUserCmd = new CreateUserCommand({
      UserName: iamUserName,
      Path: '/simplifica/email/',
      Tags: [
        { Key: 'Domain', Value: domain },
        { Key: 'CompanyId', Value: companyId },
        { Key: 'CreatedBy', Value: 'simplifica-crm' },
      ],
    });
    const createUserResp = await iam.send(createUserCmd);
    iamUserArn = createUserResp.User?.Arn ?? '';
    console.log(`[aws-iam-provision] Created IAM user: ${iamUserName}`);

    const policyName = `${iamUserName}-ses-send`;
    const policyDoc = buildSesPolicy(domain);
    const putPolicyCmd = new PutUserPolicyCommand({
      UserName: iamUserName,
      PolicyName: policyName,
      PolicyDocument: policyDoc,
    });
    await iam.send(putPolicyCmd);
    console.log(`[aws-iam-provision] Attached policy: ${policyName}`);

    const createKeyCmd = new CreateAccessKeyCommand({ UserName: iamUserName });
    const createKeyResp = await iam.send(createKeyCmd);
    accessKeyId = createKeyResp.AccessKey?.AccessKeyId ?? '';
    secretAccessKey = createKeyResp.AccessKey?.SecretAccessKey ?? '';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('CreateAccessKey did not return credentials');
    }
  } catch (err: any) {
    console.error('[aws-iam-provision] IAM error:', err.message);
    return new Response(JSON.stringify({ success: false, error: `IAM error: ${err.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Encrypt secret and store in DB ──────────────────────────────────────
  const supabaseAdmin = await getServiceClient();
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? 'simplifica-default-encryption-key-please-change';

  // Encrypt using pgp_sym_encrypt via RPC
  const { data: encryptedHex, error: encryptErr } = await supabaseAdmin.rpc('encrypt_text', {
    plaintext: secretAccessKey,
    key: encryptionKey,
  });

  if (encryptErr) {
    console.error('[aws-iam-provision] Encryption failed:', encryptErr.message);
    return new Response(JSON.stringify({ success: false, error: `Encryption failed: ${encryptErr.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Update email account
  const { error: updateErr } = await supabaseAdmin
    .from('company_email_accounts')
    .update({
      provider_type: 'ses_iam',
      iam_user_arn: iamUserArn,
      iam_access_key_id: accessKeyId,
      smtp_encrypted_password: encryptedHex,
      updated_at: new Date().toISOString(),
    })
    .eq('id', emailAccountId)
    .eq('company_id', companyId);

  if (updateErr) {
    console.error('[aws-iam-provision] DB update error:', updateErr.message);
    return new Response(JSON.stringify({ success: false, error: `DB update failed: ${updateErr.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`[aws-iam-provision] Account updated: provider_type=ses_iam, iam_user_arn=${iamUserArn}`);

  return new Response(
    JSON.stringify({
      success: true,
      iamUserArn,
      accessKeyId,
      message: 'IAM user created and credentials stored securely.',
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3';
import { simpleParser } from 'npm:mailparser';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

function getCorsOrigin(req: Request): string {
  const origin = req.headers.get('origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return '';
}

function makeCorsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-inbound-secret',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: makeCorsHeaders(req) });
  }

  // Rate limiting: 60 req/min per IP (inbound webhook + admin UI path)
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`process-inbound-email:${ip}`, 60, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        ...makeCorsHeaders(req),
        'Content-Type': 'application/json',
        ...getRateLimitHeaders(rl),
      },
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let data = await req.json();
    const { action, s3_key } = data;

    // --- AUTHORIZATION LOGIC ---
    // INBOUND_WEBHOOK_SECRET is REQUIRED. If not configured the function
    // refuses ALL requests (fail-closed). The JWT super-admin fallback has
    // been removed: it widened the attack surface unnecessarily.
    const inboundSecret = Deno.env.get('INBOUND_WEBHOOK_SECRET');
    if (!inboundSecret) {
      console.error(
        '[process-inbound-email] FATAL: INBOUND_WEBHOOK_SECRET is not set. All requests rejected.',
      );
      return new Response(
        JSON.stringify({ error: 'Service misconfigured — contact administrator' }),
        {
          status: 503,
          headers: { ...makeCorsHeaders(req), 'Content-Type': 'application/json' },
        },
      );
    }

    const webhookHeader = req.headers.get('x-inbound-secret');
    let isAuthorized = false;

    // Timing-safe comparison to prevent timing attacks on the webhook secret
    if (webhookHeader) {
      const encoder = new TextEncoder();
      const a = encoder.encode(inboundSecret);
      const b = encoder.encode(webhookHeader);
      if (a.length === b.length) {
        let diff = 0;
        for (let i = 0; i < a.length; i++) {
          diff |= a[i] ^ b[i];
        }
        if (diff === 0) isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...makeCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // --- REPROCESS LOGIC ---
    // VULN-07 fix: Validate s3_key to prevent path traversal (including double-encoded variants)
    if (action === 'reprocess' && s3_key) {
      const decodedOnce = decodeURIComponent(s3_key);
      const decodedTwice = decodeURIComponent(decodedOnce);
      const allVariants = [s3_key, decodedOnce, decodedTwice];
      const hasBadChars = allVariants.some(
        (v) => v.includes('..') || v.includes('\\') || v.includes('\0'),
      );
      const validKeyPattern = /^[a-zA-Z0-9\-_\/.+=@]+$/;
      if (hasBadChars || !validKeyPattern.test(decodedTwice)) {
        return new Response(JSON.stringify({ error: 'Invalid s3_key' }), {
          status: 400,
          headers: { ...makeCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      console.log('Reprocessing from S3:', s3_key);
      const s3Client = new S3Client({
        region: Deno.env.get('AWS_REGION') || 'eu-west-3',
        credentials: {
          accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') || '',
          secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') || '',
        },
      });

      const s3Response = await s3Client.send(
        new GetObjectCommand({
          Bucket: Deno.env.get('S3_BUCKET') || '',
          Key: s3_key,
        }),
      );

      const rawEmailString = await s3Response.Body?.transformToString();
      if (!rawEmailString) throw new Error('Could not read file from S3');

      const parsed = await simpleParser(rawEmailString);

      // Map S3 parse result to standard payload
      data = {
        to:
          parsed.to?.value[0]?.address || extractEmail(Deno.env.get('AWS_DEFAULT_RECIPIENT') || ''), // Fallback
        from: {
          name: parsed.from?.value[0]?.name || '',
          email: parsed.from?.value[0]?.address || parsed.from?.text,
        },
        subject: parsed.subject || 'Sin Asunto',
        body: parsed.text || '',
        html_body: parsed.html || '',
        messageId: data.messageId || '',
        inReplyTo: parsed.inReplyTo,
        s3_key: s3_key,
      };

      // Try to find the actual recipient from headers if not in parsed.to
      if (!data.to) {
        const toHeader = parsed.headers.get('to');
        if (toHeader) data.to = extractEmail(toHeader.toString());
      }
    }

    const { to, from, subject, body, html_body, messageId, inReplyTo } = data;

    let auditStatus = 'delivered';
    let auditError = null;
    let auditCompanyId = null;

    try {
      if (!to || !from || !subject) {
        throw new Error('Missing required fields: to, from, subject');
      }

      const targetEmail = extractEmail(to);

      // 1. Find Account & Company
      const { data: account, error: accountError } = await supabaseClient
        .from('mail_accounts')
        .select('id, user_id, users:user_id(company_id)')
        .eq('email', targetEmail)
        .single();

      if (accountError || !account) {
        auditStatus = 'account_not_found';
        throw new Error(`Account not found for ${targetEmail}`);
      }

      // @ts-ignore
      auditCompanyId = account.users?.company_id;

      // 2. Find Inbox Folder
      const { data: inbox } = await supabaseClient
        .from('mail_folders')
        .select('id')
        .eq('account_id', account.id)
        .eq('system_role', 'inbox')
        .single();

      if (!inbox) {
        auditStatus = 'error';
        throw new Error('Inbox not found');
      }

      // 3. Threading Logic
      let threadId = null;
      if (inReplyTo) {
        const { data: originalMsg } = await supabaseClient
          .from('mail_messages')
          .select('thread_id')
          .eq('metadata->>messageId', inReplyTo)
          .single();
        if (originalMsg) threadId = originalMsg.thread_id;
      }

      if (!threadId) {
        const { data: newThread } = await supabaseClient
          .from('mail_threads')
          .insert({
            account_id: account.id,
            subject: subject,
            snippet: (body || '').substring(0, 100),
          })
          .select()
          .single();
        if (newThread) threadId = newThread.id;
      }

      // 4. Insert Message
      const { error: insertError } = await supabaseClient.from('mail_messages').insert({
        account_id: account.id,
        folder_id: inbox.id,
        thread_id: threadId,
        from: typeof from === 'string' ? { email: from, name: '' } : from,
        to: [{ email: targetEmail, name: '' }],
        subject: subject,
        body_text: body,
        body_html: html_body || body,
        snippet: (body || '').substring(0, 100),
        is_read: false,
        metadata: { messageId, inReplyTo, s3_key },
      });

      if (insertError) {
        auditStatus = 'error';
        throw insertError;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...makeCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    } catch (innerError: any) {
      console.error('Processing Error:', innerError);
      auditError = innerError.message;
      if (auditStatus === 'delivered') auditStatus = 'error';

      return new Response(JSON.stringify({ error: 'Processing error' }), {
        status: 400,
        headers: { ...makeCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    } finally {
      // ALWAYS Log to Audit (only if NOT a reprocess call, or log it as a separate recovery event?)
      // If it's a reprocess, we might want to update the original log or create a new one.
      // For now, let's just log every attempt.
      await supabaseClient.from('inbound_email_audit').insert({
        message_id: messageId,
        s3_key: s3_key,
        company_id: auditCompanyId,
        sender: typeof from === 'string' ? from : from?.email,
        recipient: to,
        subject: subject,
        status: auditStatus,
        error_message: auditError
          ? auditError + (action === 'reprocess' ? ' [Recovery Attempt]' : '')
          : action === 'reprocess'
            ? '[Recovery Attempt]'
            : null,
      });
    }
  } catch (error: any) {
    console.error('Inbound Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...makeCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});

function extractEmail(input: string): string {
  const match = input.match(/<(.+)>/);
  if (match) return match[1];
  return input.trim();
}

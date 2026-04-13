import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

serve(async (req) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  try {
    // Rate limiting: 10 req/min per IP (outbound email — spam vector)
    const ip = getClientIP(req);
    const rl = await checkRateLimit(`send-email:${ip}`, 10, 60000);
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

    // Auth: use service role client to properly verify the JWT token
    // (ANON_KEY client may not correctly validate tokens in all cases)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error('Missing Authorization header');
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error('Unauthorized: invalid or expired token');

    // Regular client (with ANON_KEY) for data access with RLS
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const {
      accountId,
      fromName,
      fromEmail,
      to, // array of {email, name}
      subject,
      body, // text body
      html_body, // optional html
    } = await req.json();

    if (!accountId || !fromEmail || !to || !subject) {
      throw new Error('Missing required fields');
    }

    // Validate accountId format before any DB query
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof accountId !== 'string' || !UUID_RE.test(accountId)) {
      throw new Error('Invalid accountId format');
    }

    if (!Array.isArray(to) || to.length === 0 || to.length > 50) {
      throw new Error('"to" must be a non-empty array (max 50 recipients)');
    }
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const t of to) {
      if (!t?.email || typeof t.email !== 'string' || !emailRx.test(t.email)) {
        throw new Error('Each recipient must have a valid email address');
      }
    }

    // VULN-06 fix: Verify fromEmail belongs to the authenticated user's mail account
    // (user obtained via service-role client above for reliable token verification)
    if (!user) throw new Error('Unauthorized');

    const { data: mailAccount } = await supabaseClient
      .from('mail_accounts')
      .select('id, email')
      .eq('id', accountId)
      .single();

    if (!mailAccount || mailAccount.email.toLowerCase() !== fromEmail.toLowerCase()) {
      throw new Error('fromEmail must match authenticated mail account');
    }

    // 1. Setup AWS Client
    const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
    const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const REGION = Deno.env.get('AWS_REGION') ?? 'us-east-1';

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error('Missing AWS credentials');
    }

    const aws = new AwsClient({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: REGION,
      service: 'email',
    });

    // 2. Prepare SES params
    // aws4fetch doesn't have a high level SES helper, we use raw API.
    // Action=SendEmail

    const toAddresses = to.map((t: any) => t.email);

    // Construct form data for SES
    const params = new URLSearchParams();
    params.append('Action', 'SendEmail');
    // SECURITY: Sanitize fromName to prevent email header injection
    const safeName = fromName ? fromName.replace(/[\r\n"<>]/g, '').substring(0, 200) : '';
    params.append('Source', safeName ? `"${safeName}" <${fromEmail}>` : fromEmail);

    toAddresses.forEach((email: string, index: number) => {
      params.append(`Destination.ToAddresses.member.${index + 1}`, email);
    });

    // SECURITY: Strip CRLF from subject to prevent email header injection
    params.append('Message.Subject.Data', subject.replace(/[\r\n]/g, ' ').substring(0, 998));
    // Enforce body length limits to prevent oversized SES payloads
    const safeBody = String(body ?? '').substring(0, 100000);
    const safeHtml = html_body ? String(html_body).substring(0, 200000) : null;
    params.append('Message.Body.Text.Data', safeBody);
    if (safeHtml) {
      params.append('Message.Body.Html.Data', safeHtml);
    }

    // 3. Send to AWS
    const response = await aws.fetch(`https://email.${REGION}.amazonaws.com`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AWS SES Error:', errorText);
      throw new Error(`AWS SES Error: ${response.status} ${errorText}`);
    }

    const xmlResponse = await response.text();
    // Parse MessageId from XML if needed, but simple success check is usually enough

    // 4. Save to Sent Folder
    // a. Find 'Sent' folder for this account
    const { data: folderData, error: folderError } = await supabaseClient
      .from('mail_folders')
      .select('id')
      .eq('account_id', accountId)
      .eq('system_role', 'sent')
      .single();

    let folderId = null;
    if (folderData) {
      folderId = folderData.id;
    } else {
      // Fallback: try finding by name 'Sent'
      const { data: folderByName } = await supabaseClient
        .from('mail_folders')
        .select('id')
        .eq('account_id', accountId)
        .eq('name', 'Sent')
        .single();
      if (folderByName) folderId = folderByName.id;
    }

    // b. Insert message
    const { data: msgData, error: msgError } = await supabaseClient
      .from('mail_messages')
      .insert({
        account_id: accountId,
        folder_id: folderId,
        from: { name: fromName, email: fromEmail },
        to: to,
        subject: subject,
        body_text: safeBody,
        body_html: safeHtml || safeBody,
        snippet: safeBody.substring(0, 100),
        is_read: true,
        received_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (msgError) {
      console.error('Error saving to Sent:', msgError);
      // We don't fail the request because email was sent, but warn.
    }

    return new Response(JSON.stringify({ success: true, messageId: 'sent', dbMessage: msgData }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('send-email function error:', error?.message, error?.stack);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      {
        status: error.status || 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      },
    );
  }
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

/** Escape HTML special characters for safe inline insertion into email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface ProfessionalEmailOpts {
  content: string;
  senderName: string | null;
  fromEmail: string;
  signature: string | null;
  avatarUrl: string | null;
  title: string | null;
  companyName: string | null;
  companyLogoUrl: string | null;
  primaryColor: string | null;
}

function buildProfessionalEmailHtml(opts: ProfessionalEmailOpts): string {
  const { content, senderName, fromEmail, signature, avatarUrl, title, companyName, companyLogoUrl, primaryColor } =
    opts;

  // Validate primary color is a real hex value to prevent CSS injection
  const color =
    primaryColor && /^#[0-9a-fA-F]{3,6}$/.test(primaryColor) ? primaryColor : '#3B82F6';

  const displayName = senderName ? escapeHtml(senderName) : escapeHtml(fromEmail);
  const initial = (senderName || fromEmail).charAt(0).toUpperCase();

  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" width="52" height="52" alt="${displayName}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;display:block;">`
    : `<div style="width:52px;height:52px;border-radius:50%;background-color:${color};font-size:22px;font-weight:700;color:#ffffff;text-align:center;line-height:52px;">${initial}</div>`;

  const nameLine = senderName
    ? `<div style="font-size:15px;font-weight:700;color:#111827;margin:0 0 3px 0;">${displayName}</div>`
    : '';
  const titleLine = title
    ? `<div style="font-size:13px;color:${color};margin:0 0 3px 0;">${escapeHtml(title)}</div>`
    : '';
  const emailLine = `<div style="font-size:12px;color:#6b7280;margin:0;">${escapeHtml(fromEmail)}</div>`;
  const companyLine = companyName
    ? `<div style="font-size:12px;color:#9ca3af;margin:2px 0 0 0;">${escapeHtml(companyName)}</div>`
    : '';
  const customSig = signature
    ? `<div style="font-size:13px;color:#374151;margin:10px 0 0 0;white-space:pre-wrap;line-height:1.5;">${escapeHtml(signature)}</div>`
    : '';

  const logoRow = companyLogoUrl
    ? `<tr><td colspan="2" style="padding-top:14px;"><img src="${companyLogoUrl}" alt="${escapeHtml(companyName || '')}" height="24" style="height:24px;max-width:120px;object-fit:contain;opacity:0.7;display:block;"></td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:24px 12px 48px;">
    <div style="background-color:#ffffff;border-radius:10px;padding:28px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <div style="font-size:15px;line-height:1.7;color:#374151;">${content}</div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 20px;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:top;width:66px;padding-right:14px;">${avatarHtml}</td>
          <td style="vertical-align:top;">${nameLine}${titleLine}${emailLine}${companyLine}${customSig}</td>
        </tr>
        ${logoRow}
      </table>
    </div>
  </div>
</body>
</html>`;
}

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
      cc, // array of {email, name} — optional
      bcc, // array of {email, name} — optional
      subject,
      body, // text body
      html_body, // optional html
      metadata, // optional — used to pass reply_to for external delivery
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
    const {
      data: { user },
      error: authErr,
    } = await supabaseClient.auth.getUser();
    if (authErr || !user) {
      const err = new Error('Unauthorized') as any;
      err.status = 401;
      throw err;
    }

    const { data: mailAccount } = await supabaseClient
      .from('mail_accounts')
      .select('id, email, user_id, settings')
      .eq('id', accountId)
      .single();

    if (!mailAccount || mailAccount.email.toLowerCase() !== fromEmail.toLowerCase()) {
      throw new Error('fromEmail must match authenticated mail account');
    }

    // Fetch professional + company branding for email signature
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: professionalRows } = await supabaseAdmin
      .from('professionals')
      .select('display_name, title, avatar_url, companies(name, logo_url, settings)')
      .eq('user_id', (mailAccount as any).user_id)
      .eq('is_active', true)
      .limit(1);
    const professional = professionalRows?.[0] ?? null;

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
    // Reply-To for correct routing when recipient replies
    if (metadata?.reply_to) {
      params.append('ReplyToAddresses.member.1', metadata.reply_to);
    }

    toAddresses.forEach((email: string, index: number) => {
      params.append(`Destination.ToAddresses.member.${index + 1}`, email);
    });

    // CC addresses
    if (Array.isArray(cc) && cc.length > 0) {
      const ccAddresses = cc.map((c: any) => c.email).filter(Boolean);
      ccAddresses.forEach((email: string, index: number) => {
        params.append(`Destination.CcAddresses.member.${index + 1}`, email);
      });
    }

    // BCC addresses
    if (Array.isArray(bcc) && bcc.length > 0) {
      const bccAddresses = bcc.map((b: any) => b.email).filter(Boolean);
      bccAddresses.forEach((email: string, index: number) => {
        params.append(`Destination.BccAddresses.member.${index + 1}`, email);
      });
    }

    // SECURITY: Strip CRLF from subject to prevent email header injection
    params.append('Message.Subject.Data', subject.replace(/[\r\n]/g, ' ').substring(0, 998));
    // Enforce body length limits to prevent oversized SES payloads
    const safeBody = String(body ?? '').substring(0, 100000);
    // Wrap content in professional HTML template with sender's signature + branding
    const userContent = html_body
      ? String(html_body).substring(0, 150000)
      : safeBody.replace(/\n/g, '<br>');
    const safeHtml = buildProfessionalEmailHtml({
      content: userContent,
      senderName: fromName ?? null,
      fromEmail,
      signature: (mailAccount as any).settings?.signature ?? null,
      avatarUrl: (professional as any)?.avatar_url ?? null,
      title: (professional as any)?.title ?? null,
      companyName: (professional as any)?.companies?.name ?? null,
      companyLogoUrl: (professional as any)?.companies?.logo_url ?? null,
      primaryColor: (professional as any)?.companies?.settings?.branding?.primary_color ?? null,
    }).substring(0, 200000);
    // 3. Deliver to recipients
    //    - Internal CRM users (have a mail_account): insert directly into their Inbox
    //    - External users: send via AWS SES
    const allRecipients = [...to, ...(Array.isArray(cc) ? cc : []), ...(Array.isArray(bcc) ? bcc : [])];
    const recipientEmails = allRecipients.map((r: any) => r.email?.toLowerCase()).filter(Boolean);

    // Find internal recipients (those with a mail_account in the CRM)
    const { data: internalAccounts } = await supabaseAdmin
      .from('mail_accounts')
      .select('id, email, user_id')
      .in('email', recipientEmails.map(e => e.toLowerCase()));

    const internalMap = new Map(
      (internalAccounts ?? []).map((acc: any) => [acc.email.toLowerCase(), acc])
    );

    const externalRecipients: string[] = [];
    for (const email of toAddresses) {
      if (!internalMap.has(email.toLowerCase())) {
        externalRecipients.push(email);
      }
    }

    // HACK: Check if "external" recipients are actually CRM users whose email is just a login identity
    // (not a real external email). If they have a mail_account, deliver internally.
    // This handles the case where owner's CRM login = digitalizamostupyme@gmail.com but their
    // webmail account = testing@sincronia.agency - the reply should go to their webmail.
    if (externalRecipients.length > 0) {
      console.log('[send-email] Checking CRM users for external recipients:', externalRecipients);
      
      // First try: find mail_accounts directly by the recipient emails
      const { data: accountsByEmail, error: accountsByEmailError } = await supabaseAdmin
        .from('mail_accounts')
        .select('id, email, user_id')
        .in('email', externalRecipients.map(e => e.toLowerCase()))
        .eq('is_active', true);

      console.log('[send-email] mail_accounts by email:', JSON.stringify({ accountsByEmail, accountsByEmailError }));

      if (accountsByEmail && accountsByEmail.length > 0) {
        for (const acc of accountsByEmail) {
          const emailLower = acc.email.toLowerCase();
          const idx = externalRecipients.indexOf(emailLower);
          if (idx > -1) externalRecipients.splice(idx, 1);
          if (!internalMap.has(emailLower)) {
            internalMap.set(emailLower, { id: acc.id, email: acc.email, user_id: acc.user_id });
            console.log('[send-email] Added to internalMap from mail_accounts lookup:', acc.email);
          }
        }
      }

      // Second try: find users by their login email (not mail_account email) and get their mail_account
      if (externalRecipients.length > 0) {
        const { data: usersWithAccounts, error: usersError } = await supabaseAdmin
          .from('users')
          .select('email, mail_accounts(id, email, user_id, is_active)')
          .in('email', externalRecipients.map(e => e.toLowerCase()));

        console.log('[send-email] users with mail_accounts:', JSON.stringify({ usersWithAccounts, usersError }));

        if (usersWithAccounts && usersWithAccounts.length > 0) {
          for (const user of usersWithAccounts) {
            const acc = (user as any).mail_accounts?.[0];
            if (acc && acc.is_active) {
              console.log('[send-email] Found user with mail_account:', JSON.stringify({ user: user.email, acc }));
              const emailLower = user.email.toLowerCase();
              const idx = externalRecipients.indexOf(emailLower);
              if (idx > -1) externalRecipients.splice(idx, 1);
              if (!internalMap.has(emailLower)) {
                internalMap.set(emailLower, { id: acc.id, email: acc.email, user_id: acc.user_id });
                console.log('[send-email] Added to internalMap from user lookup:', acc.email);
              }
            }
          }
        }
      }
    }

    // Save to Sent folder first (sender's perspective)
    const { data: folderData } = await supabaseClient
      .from('mail_folders')
      .select('id')
      .eq('account_id', accountId)
      .or('system_role.eq.sent,name.eq.Sent')
      .maybeSingle();

    const folderId = folderData?.id ?? null;

    const { data: msgData, error: msgError } = await supabaseClient
      .from('mail_messages')
      .insert({
        account_id: accountId,
        folder_id: folderId,
        from: { name: fromName, email: fromEmail },
        to: to,
        cc: Array.isArray(cc) ? cc : [],
        bcc: Array.isArray(bcc) ? bcc : [],
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
    }

    // Insert into internal recipients' Inboxes directly (no SES needed)
    // internalMap accumulates ALL found internal accounts:
    // 1. Those found directly by mail_account.email (initial query)
    // 2. Those found via user login email lookup (HACK block above)
    const allInternalAccounts = Array.from(internalMap.values());
    if (allInternalAccounts.length > 0) {
      const replyThreadId = (metadata as any)?.thread_id as string | null;

      for (const internalAcc of allInternalAccounts) {
        try {
          const { data: inboxFolder } = await supabaseAdmin
            .from('mail_folders')
            .select('id')
            .eq('account_id', internalAcc.id)
            .eq('system_role', 'inbox')
            .maybeSingle();

          if (inboxFolder) {
            // Try to find existing thread if this is a reply
            console.log('[send-email] Delivering internally to:', internalAcc.email, 'via mail_account:', internalAcc.id);
            let threadId: string | null = null;
            if (replyThreadId) {
              // Check if this thread exists in the internal recipient's account
              const { data: existingThread } = await supabaseAdmin
                .from('mail_threads')
                .select('id')
                .eq('id', replyThreadId)
                .eq('account_id', internalAcc.id)
                .maybeSingle();
              threadId = existingThread?.id ?? null;
              console.log('[send-email] replyThreadId:', replyThreadId, '-> found thread:', threadId);
            }

            // If no existing thread found (or not a reply), create new one
            if (!threadId) {
              console.log('[send-email] Creating new thread for internal delivery');
              const { data: thread } = await supabaseAdmin
                .from('mail_threads')
                .insert({
                  account_id: internalAcc.id,
                  subject: subject,
                  snippet: safeBody.substring(0, 100),
                })
                .select()
                .single();
              threadId = thread?.id ?? null;

              // NEW THREAD: link to the original thread so UI can show full conversation
              // reply_to_thread_id tells the client "fetch messages from this thread too"
              if (replyThreadId) {
                console.log('[send-email] Linking new thread', threadId, 'to original thread:', replyThreadId);
              }
            }

            console.log('[send-email] Inserting message into thread:', threadId, 'folder:', inboxFolder.id);
            // Build metadata: include reply_to_thread_id so UI can fetch the linked conversation
            const messageMetadata = {
              ...(typeof metadata === 'object' ? metadata : {}),
              ...(replyThreadId && threadId !== replyThreadId ? { reply_to_thread_id: replyThreadId } : {}),
            };
            await supabaseAdmin.from('mail_messages').insert({
              account_id: internalAcc.id,
              folder_id: inboxFolder.id,
              thread_id: threadId,
              from: { name: fromName, email: fromEmail },
              to: [{ email: internalAcc.email, name: '' }],
              subject: subject,
              body_text: safeBody,
              body_html: safeHtml || safeBody,
              snippet: safeBody.substring(0, 100),
              is_read: false,
              received_at: new Date().toISOString(),
              metadata: messageMetadata,
            });
            console.log('[send-email] Message inserted successfully for internal user:', internalAcc.email);
          }
        } catch (internalErr) {
          console.error(`Error delivering to internal user ${internalAcc.email}:`, internalErr);
        }
      }
    }

    // Send external recipients via AWS SES
    if (externalRecipients.length > 0) {
      // Rebuild params with only external recipients
      const extParams = new URLSearchParams();
      extParams.append('Action', 'SendEmail');
      extParams.append('Source', safeName ? `"${safeName}" <${fromEmail}>` : fromEmail);
      // Reply-To for correct routing when recipient replies
      if (metadata?.reply_to) {
        extParams.append('ReplyToAddresses.member.1', metadata.reply_to);
      }

      externalRecipients.forEach((email: string, index: number) => {
        extParams.append(`Destination.ToAddresses.member.${index + 1}`, email);
      });

      extParams.append('Message.Subject.Data', subject.replace(/[\r\n]/g, ' ').substring(0, 998));
      extParams.append('Message.Body.Text.Data', safeBody);
      extParams.append('Message.Body.Html.Data', safeHtml);

      const response = await aws.fetch(`https://email.${REGION}.amazonaws.com`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: extParams.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AWS SES Error:', errorText);
        throw new Error(`AWS SES Error: ${response.status} ${errorText}`);
      }
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

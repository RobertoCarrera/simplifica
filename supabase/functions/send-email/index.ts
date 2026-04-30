import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildProfessionalEmailHtml(opts: {
  content: string; senderName: string | null; fromEmail: string; signature: string | null;
  avatarUrl: string | null; title: string | null; companyName: string | null;
  companyLogoUrl: string | null; primaryColor: string | null;
}): string {
  const { content, senderName, fromEmail, signature, avatarUrl, title, companyName, companyLogoUrl, primaryColor } = opts;
  const color = primaryColor && /^#[0-9a-fA-F]{3,6}$/.test(primaryColor) ? primaryColor : '#3B82F6';
  const displayName = senderName ? escapeHtml(senderName) : escapeHtml(fromEmail);
  const initial = (senderName || fromEmail).charAt(0).toUpperCase();
  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" width="52" height="52" alt="${displayName}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;display:block;">`
    : `<div style="width:52px;height:52px;border-radius:50%;background-color:${color};font-size:22px;font-weight:700;color:#ffffff;text-align:center;line-height:52px;">${initial}</div>`;
  const nameLine = senderName ? `<div style="font-size:15px;font-weight:700;color:#111827;margin:0 0 3px 0;">${displayName}</div>` : '';
  const titleLine = title ? `<div style="font-size:13px;color:${color};margin:0 0 3px 0;">${escapeHtml(title)}</div>` : '';
  const emailLine = `<div style="font-size:12px;color:#6b7280;margin:0;">${escapeHtml(fromEmail)}</div>`;
  const companyLine = companyName ? `<div style="font-size:12px;color:#9ca3af;margin:2px 0 0 0;">${escapeHtml(companyName)}</div>` : '';
  const customSig = signature ? `<div style="font-size:13px;color:#374151;margin:10px 0 0 0;white-space:pre-wrap;line-height:1.5;">${escapeHtml(signature)}</div>` : '';
  const logoRow = companyLogoUrl ? `<tr><td colspan="2" style="padding-top:14px;"><img src="${companyLogoUrl}" alt="${escapeHtml(companyName || '')}" height="24" style="height:24px;max-width:120px;object-fit:contain;opacity:0.7;display:block;"></td></tr>` : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:24px 12px 48px;">
    <div style="background-color:#ffffff;border-radius:10px;padding:28px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <div style="font-size:15px;line-height:1.7;color:#374151;">${content}</div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 20px;">
      <table cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:top;width:66px;padding-right:14px;">${avatarHtml}</td>
        <td style="vertical-align:top;">${nameLine}${titleLine}${emailLine}${companyLine}${customSig}</td>
      </tr>${logoRow}</table>
    </div>
  </div>
</body></html>`;
}

serve(async (req) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;
  try {
    const ip = getClientIP(req);
    const rl = await checkRateLimit(`send-email:${ip}`, 10, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { accountId, fromName, fromEmail, to, cc, bcc, subject, body, html_body, metadata } = await req.json();
    if (!accountId || !fromEmail || !to || !subject) throw new Error('Missing required fields');

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof accountId !== 'string' || !UUID_RE.test(accountId)) throw new Error('Invalid accountId format');
    if (!Array.isArray(to) || to.length === 0 || to.length > 50) throw new Error('"to" must be a non-empty array (max 50 recipients)');
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const t of to) { if (!t?.email || typeof t.email !== 'string' || !emailRx.test(t.email)) throw new Error('Each recipient must have a valid email address'); }

    const { data: { user }, error: authErr } = await supabaseClient.auth.getUser();
    if (authErr || !user) { const err = new Error('Unauthorized') as any; err.status = 401; throw err; }

    const { data: mailAccount } = await supabaseClient.from('mail_accounts').select('id, email, user_id, settings').eq('id', accountId).single();
    if (!mailAccount || mailAccount.email.toLowerCase() !== fromEmail.toLowerCase()) throw new Error('fromEmail must match authenticated mail account');

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: professionalRows } = await supabaseAdmin.from('professionals').select('display_name, title, avatar_url, companies(name, logo_url, settings)').eq('user_id', (mailAccount as any).user_id).eq('is_active', true).limit(1);
    const professional = professionalRows?.[0] ?? null;

    const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
    const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const REGION = Deno.env.get('AWS_REGION') ?? 'us-east-1';
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) throw new Error('Missing AWS credentials');
    const aws = new AwsClient({ accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY, region: REGION, service: 'email' });

    const toAddresses = to.map((t: any) => t.email);
    const safeName = fromName ? fromName.replace(/[\r\n"<>]/g, '').substring(0, 200) : '';
    const safeBody = String(body ?? '').substring(0, 100000);
    const userContent = html_body ? String(html_body).substring(0, 150000) : safeBody.replace(/\n/g, '<br>');
    const safeHtml = buildProfessionalEmailHtml({
      content: userContent, senderName: fromName ?? null, fromEmail,
      signature: (mailAccount as any).settings?.signature ?? null,
      avatarUrl: (professional as any)?.avatar_url ?? null,
      title: (professional as any)?.title ?? null,
      companyName: (professional as any)?.companies?.name ?? null,
      companyLogoUrl: (professional as any)?.companies?.logo_url ?? null,
      primaryColor: (professional as any)?.companies?.settings?.branding?.primary_color ?? null,
    }).substring(0, 200000);

    // Identify internal vs external recipients
    const allRecipients = [...to, ...(Array.isArray(cc) ? cc : []), ...(Array.isArray(bcc) ? bcc : [])];
    const recipientEmails = allRecipients.map((r: any) => r.email?.toLowerCase()).filter(Boolean);

    const { data: internalAccounts } = await supabaseAdmin.from('mail_accounts').select('id, email, user_id').in('email', recipientEmails.map(e => e.toLowerCase()));
    const internalMap = new Map((internalAccounts ?? []).map((acc: any) => [acc.email.toLowerCase(), acc]));

    const externalRecipients: string[] = [];
    for (const email of toAddresses) { if (!internalMap.has(email.toLowerCase())) externalRecipients.push(email); }

    if (externalRecipients.length > 0) {
      const { data: accountsByEmail } = await supabaseAdmin.from('mail_accounts').select('id, email, user_id').in('email', externalRecipients.map(e => e.toLowerCase())).eq('is_active', true);
      if (accountsByEmail && accountsByEmail.length > 0) {
        for (const acc of accountsByEmail) {
          const emailLower = acc.email.toLowerCase();
          const idx = externalRecipients.indexOf(emailLower);
          if (idx > -1) externalRecipients.splice(idx, 1);
          if (!internalMap.has(emailLower)) internalMap.set(emailLower, { id: acc.id, email: acc.email, user_id: acc.user_id });
        }
      }
      if (externalRecipients.length > 0) {
        const { data: usersWithAccounts } = await supabaseAdmin.from('users').select('email, mail_accounts(id, email, user_id, is_active)').in('email', externalRecipients.map(e => e.toLowerCase()));
        if (usersWithAccounts && usersWithAccounts.length > 0) {
          for (const user of usersWithAccounts) {
            const acc = (user as any).mail_accounts?.[0];
            if (acc && acc.is_active) {
              const emailLower = user.email.toLowerCase();
              const idx = externalRecipients.indexOf(emailLower);
              if (idx > -1) externalRecipients.splice(idx, 1);
              if (!internalMap.has(emailLower)) internalMap.set(emailLower, { id: acc.id, email: acc.email, user_id: acc.user_id });
            }
          }
        }
      }
    }

    const replyThreadId = (metadata as any)?.thread_id as string | null;

    // Save to Sent with reply_to_thread_id in metadata
    const { data: folderData } = await supabaseClient.from('mail_folders').select('id').eq('account_id', accountId).or('system_role.eq.sent,name.eq.Sent').maybeSingle();

    const sentMetadata: Record<string, any> = {
      ...(typeof metadata === 'object' ? metadata : {}),
    };
    if (replyThreadId) sentMetadata.reply_to_thread_id = replyThreadId;

    const { data: msgData, error: msgError } = await supabaseClient.from('mail_messages').insert({
      account_id: accountId, folder_id: folderData?.id ?? null,
      from: { name: fromName, email: fromEmail }, to, cc: Array.isArray(cc) ? cc : [], bcc: Array.isArray(bcc) ? bcc : [],
      subject, body_text: safeBody, body_html: safeHtml || safeBody, snippet: safeBody.substring(0, 100),
      is_read: true, received_at: new Date().toISOString(),
      metadata: sentMetadata,
    }).select().single();
    if (msgError) { console.error('Error saving to Sent:', msgError); throw new Error('Failed to save sent message'); }

    const sentThreadId = msgData?.thread_id;
    const internalLinkedThreadIds: string[] = [];

    // Deliver to OTHER internal recipients only (skip self-delivery)
    const allInternalAccounts = Array.from(internalMap.values());
    const otherInternalAccounts = allInternalAccounts.filter(acc => acc.id !== accountId);

    if (otherInternalAccounts.length > 0) {
      for (const internalAcc of otherInternalAccounts) {
        let threadId: string | null = null;

        const { data: inboxFolder } = await supabaseAdmin.from('mail_folders').select('id').eq('account_id', internalAcc.id).eq('system_role', 'inbox').maybeSingle();
        if (!inboxFolder) { console.error(`No inbox for ${internalAcc.id}`); continue; }

        if (replyThreadId) {
          const { data: existingThread } = await supabaseAdmin.from('mail_threads').select('id').eq('id', replyThreadId).eq('account_id', internalAcc.id).maybeSingle();
          if (existingThread) threadId = existingThread.id;
        }

        if (!threadId) {
          const { data: thread } = await supabaseAdmin.from('mail_threads').insert({ account_id: internalAcc.id, subject, snippet: safeBody.substring(0, 100) }).select().single();
          threadId = thread?.id ?? null;
        }

        if (!threadId) { console.error(`Failed thread for ${internalAcc.id}`); continue; }

        const messageMetadata: Record<string, any> = {
          ...(typeof metadata === 'object' ? metadata : {}),
          linked_thread_id: sentThreadId,
          reply_to_thread_id: replyThreadId ?? sentThreadId,
        };

        const { error: deliveryError } = await supabaseAdmin.from('mail_messages').insert({
          account_id: internalAcc.id, folder_id: inboxFolder.id, thread_id: threadId,
          from: { name: fromName, email: fromEmail }, to: [{ email: internalAcc.email, name: '' }],
          subject, body_text: safeBody, body_html: safeHtml || safeBody, snippet: safeBody.substring(0, 100),
          is_read: false, received_at: new Date().toISOString(), metadata: messageMetadata,
        });

        if (deliveryError) { console.error(`Delivery error for ${internalAcc.email}:`, deliveryError); continue; }
        internalLinkedThreadIds.push(threadId);
      }
    }

    if (sentThreadId && internalLinkedThreadIds.length > 0 && msgData) {
      await supabaseClient.from('mail_messages').update({ metadata: { ...(msgData.metadata || {}), linked_thread_ids: internalLinkedThreadIds } }).eq('id', msgData.id);
    }

    if (externalRecipients.length > 0) {
      const extParams = new URLSearchParams();
      extParams.append('Action', 'SendEmail');
      extParams.append('Source', safeName ? `"${safeName}" <${fromEmail}>` : fromEmail);
      if (metadata?.reply_to) extParams.append('ReplyToAddresses.member.1', metadata.reply_to);
      externalRecipients.forEach((email: string, index: number) => { extParams.append(`Destination.ToAddresses.member.${index + 1}`, email); });
      extParams.append('Message.Subject.Data', subject.replace(/[\r\n]/g, ' ').substring(0, 998));
      extParams.append('Message.Body.Text.Data', safeBody);
      extParams.append('Message.Body.Html.Data', safeHtml);
      const response = await aws.fetch(`https://email.${REGION}.amazonaws.com`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: extParams.toString() });
      if (!response.ok) { const errorText = await response.text(); console.error('AWS SES Error:', errorText); throw new Error(`AWS SES Error: ${response.status} ${errorText}`); }
    }

    return new Response(JSON.stringify({ success: true, messageId: 'sent', dbMessage: msgData }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('send-email error:', error?.message, error?.stack);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: error.status || 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
  }
});
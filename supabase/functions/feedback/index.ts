import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

interface FeedbackPayload {
  type: 'bug' | 'improvement';
  description: string;
  screenshot?: string;
  location: string;
}

function dataURLToUint8Array(dataURL: string): Uint8Array {
  const base64 = dataURL.replace(/^data:image\/\w+;base64,/, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function buildFeedbackHtml(opts: {
  type: 'bug' | 'improvement';
  description: string;
  location: string | undefined;
  screenshotUrl: string | null;
}): string {
  const emoji = opts.type === 'bug' ? '🐛' : '💡';
  const badgeColor = opts.type === 'bug' ? '#fee2e2;#991b1b' : '#dbeafe;#1e40af';
  const [badgeBg, badgeText] = badgeColor.split(';');
  const badgeLabel = opts.type === 'bug' ? '🐛 Bug' : '💡 Mejora';

  let screenshotBlock = '';
  if (opts.screenshotUrl) {
    screenshotBlock =
      '<a href="' + opts.screenshotUrl + '" target="_blank" rel="noopener">' +
      '<img src="' + opts.screenshotUrl + '" alt="Captura" style="max-width:300px;border-radius:8px;border:1px solid #e5e7eb;display:block;margin:8px 0;cursor:pointer;" />' +
      '</a>';
  }

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head><meta charset="utf-8"></head>',
    '<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#333;margin:0;padding:24px;background:#f3f4f6;">',
    '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">',
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">',
    '<span style="display:inline-block;padding:4px 12px;border-radius:9999px;font-weight:bold;font-size:13px;background:' + badgeBg + ';color:' + badgeText + ';">' + badgeLabel + '</span>',
    '<span style="font-size:13px;color:#6b7280;">' + emoji + ' Feedback</span>',
    '</div>',
    '<div style="margin-bottom:16px;">',
    '<div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Pagina</div>',
    '<a href="' + (opts.location || '#') + '" style="color:#2563eb;font-size:13px;word-break:break-all;">' + (opts.location || 'No especificada') + '</a>',
    '</div>',
    '<div style="margin-bottom:16px;">',
    '<div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Descripcion</div>',
    '<pre style="margin:0;font-size:14px;color:#111827;line-height:1.6;white-space:pre-wrap;">' + opts.description + '</pre>',
    '</div>',
    screenshotBlock ? '<div style="margin-top:8px;">' + screenshotBlock + '</div>' : '',
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');
}

async function sendExternalEmail(
  region: string,
  awsAccessKeyId: string,
  awsSecretAccessKey: string,
  toEmail: string,
  subject: string,
  htmlBody: string,
  textBody: string,
  fromEmail: string,
  fromName: string,
  replyToEmail: string,
): Promise<{ success: boolean; error?: string }> {
  const aws = new AwsClient({
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
    region,
    service: 'email',
  });

  const body = [
    'Action=SendEmail',
    'Version=2010-12-01',
    'Source=' + fromEmail,
    'ReplyToAddresses.member.1=' + replyToEmail,
    'Destination.ToAddresses.member.1=' + toEmail,
    'Message.Subject.Data=' + encodeURIComponent(subject),
    'Message.Subject.Charset=UTF-8',
    'Message.Body.Html.Data=' + encodeURIComponent(htmlBody),
    'Message.Body.Html.Charset=UTF-8',
    'Message.Body.Text.Data=' + encodeURIComponent(textBody),
    'Message.Body.Text.Charset=UTF-8',
  ].join('&');

  try {
    const response = await aws.fetch('https://email.' + region + '.amazonaws.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[feedback] SES error:', response.status, errorText);
      return { success: false, error: 'SES error ' + response.status };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[feedback] SES exception:', err.message);
    return { success: false, error: err.message };
  }
}

serve(async (req) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    Deno.env.get('DENO_DEPLOYMENT_ID') ||
    'unknown';
  const rl = await checkRateLimit(`feedback:${ip}`, 5, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Authorization required' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const jwt = authHeader.replace('Bearer ', '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

  let userId: string;
  let userEmail: string;
  let companyId: string | null;

  try {
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    userId = user.id;

    const { data: userData, error: userDataError } = await supabaseAdmin
      .from('users')
      .select('email, company_id')
      .eq('auth_user_id', user.id)
      .single();

    if (userDataError || !userData) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    userEmail = userData.email;
    companyId = userData.company_id;
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Auth error' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  let payload: FeedbackPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid payload' }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const { type, description, screenshot, location } = payload;

  if (!type || !['bug', 'improvement'].includes(type)) {
    return new Response(JSON.stringify({ error: 'Invalid type' }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  if (!description?.trim()) {
    return new Response(JSON.stringify({ error: 'Description required' }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  if (description.trim().length > 2000) {
    return new Response(JSON.stringify({ error: 'Description too long (max 2000)' }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  if (screenshot && screenshot.length > 1400000) {
    return new Response(JSON.stringify({ error: 'Screenshot too large' }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Insert company_feedback record
  const { data: feedbackData, error: feedbackError } = await supabaseAdmin
    .from('company_feedback')
    .insert({
      company_id: companyId,
      user_id: userId,
      user_email: userEmail,
      type,
      description: description.trim(),
      location,
      status: 'pending',
    })
    .select()
    .single();

  if (feedbackError) {
    console.error('[feedback] Insert error:', feedbackError);
    return new Response(JSON.stringify({ error: 'Failed to save feedback' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Upload screenshot to storage
  let screenshotUrl: string | null = null;
  if (screenshot) {
    const uploadPath = 'feedback/' + feedbackData.id + '/' + crypto.randomUUID() + '.jpg';
    const binaryData = dataURLToUint8Array(screenshot);

    const { error: uploadError } = await supabaseAdmin.storage
      .from('feedback_attachments')
      .upload(uploadPath, binaryData, { contentType: 'image/jpeg' });

    if (!uploadError) {
      const { data: signedData } = await supabaseAdmin.storage
        .from('feedback_attachments')
        .createSignedUrl(uploadPath, 3600);
      screenshotUrl = signedData?.signedUrl ?? null;

      await supabaseAdmin
        .from('company_feedback')
        .update({ screenshot_url: screenshotUrl })
        .eq('id', feedbackData.id);
    }
  }

  // Find superadmin mail_account
  const { data: superadminData, error: superadminError } = await supabaseAdmin
    .from('mail_accounts')
    .select('id, email')
    .eq('email', 'roberto@simplificacrm.es')
    .single();

  if (superadminError || !superadminData) {
    console.error('[feedback] Superadmin mail_account not found:', superadminError);
    await supabaseAdmin.from('company_feedback').update({ status: 'failed' }).eq('id', feedbackData.id);
    return new Response(JSON.stringify({ error: 'Superadmin account not found' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Find superadmin inbox folder
  const { data: inboxFolder, error: inboxError } = await supabaseAdmin
    .from('mail_folders')
    .select('id')
    .eq('account_id', superadminData.id)
    .eq('system_role', 'inbox')
    .single();

  if (inboxError || !inboxFolder) {
    console.error('[feedback] Inbox not found:', inboxError);
    await supabaseAdmin.from('company_feedback').update({ status: 'failed' }).eq('id', feedbackData.id);
    return new Response(JSON.stringify({ error: 'Inbox not found' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Create thread
  const emoji = type === 'bug' ? '🐛' : '💡';
  const threadSubject = emoji + ' [' + type.toUpperCase() + '] Feedback - ' + new Date().toLocaleDateString('es-ES');

  const { data: thread, error: threadError } = await supabaseAdmin
    .from('mail_threads')
    .insert({
      account_id: superadminData.id,
      subject: threadSubject,
      snippet: description.trim().substring(0, 100),
    })
    .select()
    .single();

  if (threadError) {
    console.error('[feedback] Thread error:', threadError);
    await supabaseAdmin.from('company_feedback').update({ status: 'failed' }).eq('id', feedbackData.id);
    return new Response(JSON.stringify({ error: 'Failed to create thread' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Build HTML email (clean, no redundant title/date/footer)
  const htmlBody = buildFeedbackHtml({ type, description: description.trim(), location, screenshotUrl });

  const textBody = [
    'FEEDBACK',
    '=======',
    'Tipo: ' + (type === 'bug' ? 'Bug' : 'Mejora'),
    'Pagina: ' + (location || 'No especificada'),
    '',
    description.trim(),
    screenshotUrl ? 'Captura: ' + screenshotUrl : '',
  ].filter(Boolean).join('\n');

  // Insert mail_message into superadmin's inbox
  const { data: mailMessage, error: mailMsgError } = await supabaseAdmin
    .from('mail_messages')
    .insert({
      account_id: superadminData.id,
      folder_id: inboxFolder.id,
      thread_id: thread.id,
      from: { name: 'Simplifica CRM Feedback', email: 'feedback@simplificacrm.es' },
      to: [{ email: superadminData.email, name: 'Roberto' }],
      subject: threadSubject,
      body_text: textBody,
      body_html: htmlBody,
      snippet: description.trim().substring(0, 100),
      is_read: false,
      received_at: new Date().toISOString(),
      metadata: {
        feedback_id: feedbackData.id,
        reply_to: userEmail,
        location,
        type,
      },
    })
    .select()
    .single();

  if (mailMsgError) {
    console.error('[feedback] Mail message error:', mailMsgError);
    await supabaseAdmin.from('company_feedback').update({ status: 'failed' }).eq('id', feedbackData.id);
    return new Response(JSON.stringify({ error: 'Failed to deliver feedback' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Update feedback with mail_message_id and status=sent
  await supabaseAdmin
    .from('company_feedback')
    .update({ mail_message_id: mailMessage.id, status: 'sent' })
    .eq('id', feedbackData.id);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
});

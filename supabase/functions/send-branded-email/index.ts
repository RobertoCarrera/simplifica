/**
 * Edge Function: send-branded-email
 * Unified branded email sender for Simplifica CRM
 *
 * - Lookup email account configured for company+emailType
 * - Render HTML template with company branding
 * - Send via AWS SES (company credentials or system default)
 * - Log send attempt to company_email_logs
 * - Non-blocking: logs errors and returns them without crashing
 *
 * Input:
 *   {
 *     companyId: string,
 *     emailType: 'booking_confirmation' | 'invoice' | 'quote' | 'consent' | 'invite' | 'waitlist' | 'inactive_notice' | 'generic',
 *     to: { email: string, name: string }[],
 *     subject?: string,        // Override generated subject
 *     data: { ... }            // Template-specific data
 *   }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, isValidUUID } from '../_shared/security.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

const EMAIL_TYPES = [
  'booking_confirmation',
  'invoice',
  'quote',
  'consent',
  'invite',
  'waitlist',
  'inactive_notice',
  'generic',
] as const;

type EmailType = typeof EMAIL_TYPES[number];

interface CompanyInfo {
  id: string;
  name: string;
  logo_url: string | null;
  cif: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  settings: {
    branding?: {
      primary_color?: string;
      secondary_color?: string;
    };
    address?: string;
  } | null;
}

interface EmailAccount {
  id: string;
  company_id: string;
  email: string;
  display_name: string | null;
  ses_from_email: string | null;
  ses_iam_role_arn: string | null; // Reserved for multi-account architecture; not used in single-account mode
  provider: string;
  is_verified: boolean;
}

interface EmailSetting {
  email_account_id: string | null;
  custom_subject_template: string | null;
  custom_body_template: string | null;
}

interface Recipient {
  email: string;
  name?: string;
}

interface TemplateData {
  // booking_confirmation
  servicio?: string;
  fecha?: string;
  hora?: string;
  empresa?: string;
  // invoice
  numero_factura?: string;
  invoice_url?: string;
  // quote
  numero_presupuesto?: string;
  quote_url?: string;
  // consent
  consent_url?: string;
  // invite
  invite_url?: string;
  // waitlist
  heading?: string;
  body_text?: string;
  waitlist_url?: string;
  // inactive_notice
  client_names?: string[];
  // generic
  message?: string;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function getAuthUser(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('Missing Authorization header');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized: invalid or expired token');
  return user;
}

// ── Response helpers ──────────────────────────────────────────────────────────

function jsonSuccess(status: number, data: unknown, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { ...getCorsHeaders({ headers: corsHeaders } as Request), 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, error: string, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...getCorsHeaders({ headers: corsHeaders } as Request), 'Content-Type': 'application/json' },
  });
}

// ── Input sanitization ────────────────────────────────────────────────────────

function sanitizeEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(trimmed)) return '';
  return trimmed.slice(0, 254);
}

function sanitizeSubject(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Strip CRLF to prevent email header injection
  return value.replace(/[\r\n]/g, ' ').slice(0, 998).trim();
}

function sanitizeText(value: unknown, maxLength = 10000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, '').replace(/[\r\n]/g, ' ').slice(0, maxLength).trim();
}

// ── Template rendering ────────────────────────────────────────────────────────

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    return val != null ? String(val) : '';
  });
}

function buildCompanyAddress(company: CompanyInfo): string {
  if (company.settings?.address) return company.settings.address;
  if (company.address) return company.address;
  return '';
}

function buildEmailFooter(company: CompanyInfo): string {
  const parts = [company.name];
  if (company.cif) parts.push(`CIF: ${company.cif}`);
  const addr = buildCompanyAddress(company);
  if (addr) parts.push(addr);
  return parts.join(' · ');
}

function renderTemplate(
  emailType: EmailType,
  company: CompanyInfo,
  data: TemplateData,
  customSubject?: string | null,
  customBody?: string | null,
): { subject: string; html: string } {
  const primaryColor = company.settings?.branding?.primary_color || '#2563eb';
  const companyLogo = company.logo_url
    ? `<img src="${company.logo_url}" alt="${company.name}" style="max-height:60px;max-width:200px;">`
    : '';
  const companyName = company.name;
  const companyFooter = buildEmailFooter(company);
  const companyAddress = buildCompanyAddress(company);

  let subject = '';
  let html = '';

  switch (emailType) {
    case 'booking_confirmation': {
      subject = customSubject || `Reserva confirmada - ${companyName}`;
      if (customBody) {
        html = interpolate(customBody, data as Record<string, unknown>);
      } else {
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  <h1 style="color:${primaryColor};text-align:center;">Reserva confirmada</h1>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Servicio</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${data.servicio || ''}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${data.fecha || ''}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Hora</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${data.hora || ''}</td></tr>
    <tr><td style="padding:8px 0;font-weight:bold;">Empresa</td><td style="padding:8px 0;">${data.empresa || companyName}</td></tr>
  </table>
  <p style="text-align:center;color:#666;font-size:12px;">${companyFooter}${companyAddress ? ' · ' + companyAddress : ''}</p>
</body>
</html>`;
      }
      break;
    }

    case 'invoice': {
      const invoiceNum = data.numero_factura || '';
      subject = customSubject || `Factura ${invoiceNum} - ${companyName}`;
      if (customBody) {
        html = interpolate(customBody, data as Record<string, unknown>);
      } else {
        const buttonHtml = data.invoice_url
          ? `<a href="${data.invoice_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Ver factura PDF</a>`
          : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  <h1 style="color:${primaryColor};text-align:center;">Factura ${invoiceNum}</h1>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${companyFooter}${company.cif ? ' · CIF: ' + company.cif : ''}</p>
  <p style="text-align:center;color:#999;font-size:11px;margin-top:10px;">En cumplimiento con el RGPD, sus datos serán tratados conforme a nuestra política de privacidad.</p>
</body>
</html>`;
      }
      break;
    }

    case 'quote': {
      const quoteNum = data.numero_presupuesto || '';
      subject = customSubject || `Presupuesto ${quoteNum} - ${companyName}`;
      if (customBody) {
        html = interpolate(customBody, data as Record<string, unknown>);
      } else {
        const buttonHtml = data.quote_url
          ? `<a href="${data.quote_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Ver presupuesto</a>`
          : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  <h1 style="color:${primaryColor};text-align:center;">Presupuesto ${quoteNum}</h1>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${companyFooter}${company.cif ? ' · CIF: ' + company.cif : ''}</p>
</body>
</html>`;
      }
      break;
    }

    case 'consent': {
      subject = customSubject || `Solicitud de consentimiento RGPD - ${companyName}`;
      if (customBody) {
        html = interpolate(customBody, data as Record<string, unknown>);
      } else {
        const buttonHtml = data.consent_url
          ? `<a href="${data.consent_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Revisar y validar datos</a>`
          : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  <h1 style="color:${primaryColor};text-align:center;">Solicitud de consentimiento RGPD</h1>
  <p style="text-align:center;">Solicitamos su consentimiento para el tratamiento de sus datos personales.</p>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${companyFooter}</p>
</body>
</html>`;
      }
      break;
    }

    case 'invite': {
      subject = customSubject || `Te han invitado a ${companyName}`;
      if (customBody) {
        html = interpolate(customBody, data as Record<string, unknown>);
      } else {
        const buttonHtml = data.invite_url
          ? `<a href="${data.invite_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a>`
          : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  <h1 style="color:${primaryColor};text-align:center;">Te han invitado a ${companyName}</h1>
  <p style="text-align:center;">Ha recibido una invitación para unirte a la plataforma de ${companyName}.</p>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${companyFooter}</p>
</body>
</html>`;
      }
      break;
    }

    case 'waitlist': {
      const heading = data.heading || '¡Estás en la lista!';
      const bodyText = data.body_text || 'Te avisaremos cuando puedas reservar.';
      subject = customSubject || heading;
      if (customBody) {
        html = interpolate(customBody, data as Record<string, unknown>);
      } else {
        const buttonHtml = data.waitlist_url
          ? `<a href="${data.waitlist_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Reservar ahora</a>`
          : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="background:linear-gradient(135deg,${primaryColor},#1e40af);padding:30px 20px;text-align:center;">
    <span style="color:#fff;font-size:18px;font-weight:bold;">Simplifica CRM</span>
  </div>
  <h1 style="color:${primaryColor};text-align:center;">${heading}</h1>
  <p style="text-align:center;font-size:16px;color:#555;">${bodyText}</p>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${companyFooter}</p>
</body>
</html>`;
      }
      break;
    }

    case 'inactive_notice': {
      subject = customSubject || `Clientes inactivos - ${companyName}`;
      const clientList = (data.client_names || []).map((name: string) => `<li style="padding:4px 0;">${sanitizeText(name, 200)}</li>`).join('');
      if (customBody) {
        html = interpolate(customBody, data as Record<string, unknown>);
      } else {
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  <h1 style="color:${primaryColor};text-align:center;">Clientes inactivos</h1>
  <p>Los siguientes clientes no han tenido actividad reciente:</p>
  <ul style="list-style:none;padding:0;">${clientList}</ul>
  <p style="text-align:center;color:#666;font-size:12px;margin-top:20px;">${companyFooter} - Este es un mensaje automático</p>
</body>
</html>`;
      }
      break;
    }

    default: {
      subject = customSubject || `Mensaje de ${companyName}`;
      const message = data.message || '';
      if (customBody) {
        html = interpolate(customBody, data as Record<string, unknown>);
      } else {
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  <p style="font-size:16px;">${message}</p>
  <p style="text-align:center;color:#666;font-size:12px;margin-top:20px;">${companyFooter}</p>
</body>
</html>`;
      }
    }
  }

  return { subject, html };
}

// ── AWS SES sender ────────────────────────────────────────────────────────────

interface SESSenderResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function sendViaSES(
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  fromEmail: string,
  fromName: string | null,
  toEmails: string[],
  subject: string,
  htmlBody: string,
): Promise<SESSenderResult> {
  const aws = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
    service: 'email',
  });

  const params = new URLSearchParams();
  params.append('Action', 'SendEmail');

  // Sanitize fromName to prevent header injection
  const safeName = fromName ? fromName.replace(/[\r\n"<>]/g, '').substring(0, 200) : '';
  params.append('Source', safeName ? `"${safeName}" <${fromEmail}>` : fromEmail);

  toEmails.forEach((email, idx) => {
    params.append(`Destination.ToAddresses.member.${idx + 1}`, email);
  });

  params.append('Message.Subject.Data', subject.replace(/[\r\n]/g, ' ').substring(0, 998));
  params.append('Message.Body.Html.Data', htmlBody.substring(0, 200000));

  try {
    const response = await aws.fetch(`https://email.${region}.amazonaws.com`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `SES Error ${response.status}: ${errorText}` };
    }

    // Extract MessageId from XML response
    const xmlText = await response.text();
    const messageIdMatch = xmlText.match(/<MessageId>(.*?)<\/MessageId>/);
    const messageId = messageIdMatch ? messageIdMatch[1] : 'unknown';

    return { success: true, messageId };
  } catch (err: any) {
    return { success: false, error: err.message || 'AWS SES request failed' };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  // Service role client for reliable token verification and log inserts
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // ANON client for RLS-protected reads
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
  );

  try {
    // ── Rate limiting: 20 emails/min per company ────────────────────────────
    const ip = getClientIP(req);
    const rl = await checkRateLimit(`send-branded-email:${ip}`, 20, 60000);
    if (!rl.allowed) {
      return jsonError(429, 'Demasiadas solicitudes. Máximo 20 emails/minuto.');
    }

    // ── Authenticate ────────────────────────────────────────────────────────
    let userId: string;
    try {
      const user = await getAuthUser(req, supabaseAdmin);
      userId = user.id;
    } catch {
      // Allow unauthenticated calls for system-triggered emails (e.g. from other Edge Functions)
      // In that case, we require companyId in the body and validate via service role
      userId = 'system';
    }

    // ── Parse input ─────────────────────────────────────────────────────────
    const body = await req.json();
    const { companyId, emailType, to, subject: subjectOverride, data: templateData = {} } = body;

    if (!companyId || !isValidUUID(companyId)) {
      return jsonError(400, 'companyId inválido o faltante');
    }

    if (!emailType || !EMAIL_TYPES.includes(emailType)) {
      return jsonError(400, `emailType inválido. Valores: ${EMAIL_TYPES.join(', ')}`);
    }

    if (!Array.isArray(to) || to.length === 0 || to.length > 50) {
      return jsonError(400, '"to" debe ser un array con 1-50 destinatarios');
    }

    // Validate recipients
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipients: Recipient[] = [];
    for (const t of to) {
      const email = sanitizeEmail(t?.email);
      if (!email || !emailRx.test(email)) {
        return jsonError(400, `Email de destinatario inválido: ${t?.email}`);
      }
      recipients.push({ email, name: typeof t.name === 'string' ? t.name.slice(0, 200) : '' });
    }

    const subject = sanitizeSubject(subjectOverride);

    // ── Validate user has access to this company ────────────────────────────
    if (userId !== 'system') {
      const { data: memberData } = await supabaseClient
        .from('company_members')
        .select('company_id')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .single();

      if (!memberData) {
        return jsonError(403, 'No tienes acceso a esta empresa');
      }
    }

    // ── Fetch company info ───────────────────────────────────────────────────
    const { data: company, error: companyError } = await supabaseClient
      .from('companies')
      .select('id, name, logo_url, cif, address, phone, email, settings')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return jsonError(404, 'Empresa no encontrada');
    }

    // ── Fetch email setting for this company+emailType ──────────────────────
    const { data: emailSetting } = await supabaseClient
      .from('company_email_settings')
      .select('email_account_id, fallback_account_id, custom_subject_template, custom_body_template')
      .eq('company_id', companyId)
      .eq('email_type', emailType)
      .single();

    // ── Fetch email account(s) ──────────────────────────────────────────────
    let accountId = emailSetting?.email_account_id;
    let account: EmailAccount | null = null;

    if (accountId) {
      const { data: acc } = await supabaseClient
        .from('company_email_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('is_active', true)
        .single();
      account = acc;
    }

    // If no account or account not active, try fallback
    if (!account && emailSetting?.fallback_account_id) {
      const { data: fallbackAcc } = await supabaseClient
        .from('company_email_accounts')
        .select('*')
        .eq('id', emailSetting.fallback_account_id)
        .eq('is_active', true)
        .single();
      if (fallbackAcc) {
        account = fallbackAcc;
        accountId = fallbackAcc.id;
      }
    }

    // If still no account, try to find any active account for this company
    if (!account) {
      const { data: anyAccount } = await supabaseClient
        .from('company_email_accounts')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false })
        .limit(1)
        .single();
      account = anyAccount;
      accountId = anyAccount?.id ?? null;
    }

    // ── Render email ─────────────────────────────────────────────────────────
    const { subject: finalSubject, html: htmlBody } = renderTemplate(
      emailType as EmailType,
      company as CompanyInfo,
      templateData as TemplateData,
      emailSetting?.custom_subject_template,
      emailSetting?.custom_body_template,
    );

    const emailSubject = subject || finalSubject;

    // ── Prepare send params ─────────────────────────────────────────────────
    const fromEmail = account?.ses_from_email || account?.email || 'noreply@simplifica.es';
    const fromName = account?.display_name || company.name;
    const toEmails = recipients.map(r => r.email);

    // ── Send via AWS SES ────────────────────────────────────────────────────
    let sendResult: SESSenderResult;
    let awsRegion = Deno.env.get('AWS_REGION') ?? 'eu-west-1';

    // Use Simplifica's AWS credentials (single account architecture)
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');

    if (!accessKeyId || !secretAccessKey) {
      sendResult = { success: false, error: 'AWS credentials not configured' };
    } else {
      sendResult = await sendViaSES(
        awsRegion,
        accessKeyId,
        secretAccessKey,
        fromEmail,
        fromName,
        toEmails,
        emailSubject,
        htmlBody,
      );
    }

    // ── Log the send attempt (non-blocking) ─────────────────────────────────
    try {
      const logData = {
        company_id: companyId,
        email_account_id: accountId,
        email_type: emailType,
        to_address: toEmails.join(', '),
        subject: emailSubject,
        status: sendResult.success ? 'sent' : 'failed',
        message_id: sendResult.messageId ?? null,
        error_message: sendResult.error ?? null,
        sent_at: new Date().toISOString(),
      };

      await supabaseAdmin
        .from('company_email_logs')
        .insert(logData);
    } catch (logErr: any) {
      // Non-blocking: log error but don't crash
      console.error('[send-branded-email] Failed to write email log:', logErr?.message);
    }

    // ── Return result ───────────────────────────────────────────────────────
    if (sendResult.success) {
      return jsonSuccess(200, {
        messageId: sendResult.messageId,
        sentTo: recipients,
        emailType,
        companyId,
      });
    } else {
      return jsonError(500, `Error al enviar email: ${sendResult.error}`);
    }
  } catch (error: any) {
    console.error('[send-branded-email] Error:', error?.message, error?.stack);
    return jsonError(error.status || 500, error.message || 'Error interno del servidor');
  }
});

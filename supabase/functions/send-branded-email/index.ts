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
// Rafter v0.27: escapeHtml + interpolate moved to _shared/escape.ts so the
// sibling Edge Functions (invoices-email, quotes-email, notify-inactive-clients,
// send-waitlist-email) can reuse the same safe-by-default escaping.
import { escapeHtml, interpolateSafe } from '../_shared/escape.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

const EMAIL_TYPES = [
  'booking_confirmation',
  'invoice',
  'quote',
  'consent',
  'invite',
  'invite_owner',
  'invite_admin',
  'invite_member',
  'invite_professional',
  'invite_agent',
  'invite_client',
  'waitlist',
  'inactive_notice',
  'generic',
  'google_review',
  'booking_reminder',
  'booking_cancellation',
  'password_reset',
  'magic_link',
  'welcome',
  'staff_credentials',
  // ── Presupuesto (recurring_budgets) notifications ────────────
  // Added in 20260610000000_budget_notifications_config.sql.
  // The Edge Function send-budget-notification dispatches these.
  'budget_created',
  'budget_reminder',
  'budget_overdue',
  // ── Booking change notifications (reservas) ────────────────────
  // Added in 20260610000002_booking_notification_settings.sql.
  // Sent by the notify-booking-change Edge Function via pg_net.
  'booking_change',
] as const;

type EmailType = typeof EMAIL_TYPES[number];

interface CompanyInfo {
  id: string;
  name: string;
  logo_url: string | null;
  nif: string | null;
  settings: {
    branding?: {
      primary_color?: string;
      secondary_color?: string;
    };
    email_branding?: {
      background_color?: string;
      font_family?: string;
      footer_text?: string | null;
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
  ses_iam_role_arn: string | null;
  provider: string;
  provider_type: 'ses_iam' | 'ses_shared' | 'google_workspace';
  is_verified: boolean;
  // SES IAM credentials
  iam_user_arn: string | null;
  iam_access_key_id: string | null;
  smtp_encrypted_password: string | null; // hex-encoded pgp_sym_encrypt (IAM secret or SMTP password)
  // Google Workspace SMTP
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  // Google Workspace OAuth2
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  oauth_refresh_token: string | null;
  oauth_token_expiry: string | null;
  auth_method: 'password' | 'oauth2' | null;
}

interface EmailSetting {
  email_account_id: string | null;
  custom_subject_template: string | null;
  custom_body_template: string | null;
  custom_header_template: string | null;
  custom_button_text: string | null;
}

interface Recipient {
  email: string;
  name?: string;
}

interface TemplateData {
  // booking_confirmation / booking_reminder / booking_cancellation
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
  // budget_created / budget_reminder / budget_overdue
  // All of these are sent by send-budget-notification. The data
  // payload includes a rich set of variables so the email template can
  // be customised per company via company_email_settings.custom_body.
  company_name?: string;
  client_name?: string;
  period?: string;
  period_label?: string;
  total?: number | string;
  currency?: string;
  total_formatted?: string;
  due_date?: string;        // ISO date
  due_date_formatted?: string;
  days_to_due?: number | null;
  budget_id?: string;
  payment_url?: string;
  cta_text?: string;
  intro?: string;
  footer_text?: string;
  kind?: 'created' | 'reminder' | 'overdue';
  day_offset?: number | null;
  locale?: 'es' | 'ca' | 'en';
  // consent
  consent_url?: string;
  // invite (all role variants)
  invite_url?: string;
  role?: string;       // owner | admin | member | professional | agent | client
  role_label?: string; // localized label: Propietario, Profesional, etc.
  inviter_name?: string;
  invited_name?: string;
  company_cif?: string;
  // waitlist
  heading?: string;
  body_text?: string;
  waitlist_url?: string;
  // inactive_notice
  client_names?: string[];
  // password_reset / magic_link
  reset_url?: string;
  // welcome
  user_name?: string;
  // staff_credentials
  temp_password?: string;
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

function jsonSuccess(status: number, data: unknown, req: Request) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, error: string, req: Request) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
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

// escapeHtml + interpolate moved to _shared/escape.ts in Rafter v0.27 —
// see that file for the security contract. The two functions used to be
// defined here as module-private helpers; the v0.26 fix closed the
// interpolate() XSS in this file, and v0.27 lifts the helpers so the
// sibling Edge Functions (invoices-email, quotes-email,
// notify-inactive-clients, send-waitlist-email) can reuse the same
// safe-by-default escaping for their fallback HTML paths.

function buildCompanyAddress(company: CompanyInfo): string {
  if (company.settings?.address) return company.settings.address;
  return '';
}

function buildEmailFooter(company: CompanyInfo): string {
  const parts = [company.name];
  if (company.nif) parts.push(`NIF: ${company.nif}`);
  const addr = buildCompanyAddress(company);
  if (addr) parts.push(addr);
  return parts.join(' · ');
}

/**
 * Append a CAN-SPAM / GDPR compliant footer block to any email HTML.
 * Required by major ISPs (Hotmail/Outlook, Gmail) to avoid the spam folder.
 * Includes physical address, privacy policy link, and unsubscribe link.
 *
 * The proper way to satisfy Hotmail's "List-Unsubscribe" requirement is the
 * MIME header (RFC 8058), which requires switching to SES SendRawEmail.
 * The body link is a strong fallback signal used by all major spam filters.
 */
function appendComplianceFooter(html: string, company: CompanyInfo, companyId: string): string {
  const appUrl = Deno.env.get('APP_URL') || 'https://app.simplificacrm.es';
  const unsubscribeUrl = `${appUrl}/unsubscribe?company=${companyId}`;
  const baseFooter = buildEmailFooter(company);
  const complianceBlock = `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">
    <p style="font-size:12px;color:#6b7280;margin:0 0 6px;text-align:center;">${baseFooter}</p>
    <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;text-align:center;line-height:1.5;">
      En cumplimiento del RGPD, sus datos serán tratados conforme a nuestra
      <a href="${appUrl}/privacidad" style="color:#6b7280;">política de privacidad</a>.
    </p>
    <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;text-align:center;">
      ¿No deseas recibir más comunicaciones?
      <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Darse de baja</a>
    </p>
  `;
  // If the html already contains a </body> close tag, insert before it;
  // otherwise just append.
  if (html.includes('</body>')) {
    return html.replace('</body>', `${complianceBlock}</body>`);
  }
  return html + complianceBlock;
}

function renderTemplate(
  emailType: EmailType,
  company: CompanyInfo,
  data: TemplateData,
  customSubject?: string | null,
  customBody?: string | null,
  customHeader?: string | null,
  customButtonText?: string | null,
): { subject: string; html: string } {
  const primaryColor = company.settings?.branding?.primary_color || '#4f46e5';
  const backgroundColor = company.settings?.email_branding?.background_color || '#F9FAFB';
  const fontFamily = (company.settings?.email_branding?.font_family || 'Arial').replace(/['"<>&]/g, '');
  const companyLogo = company.logo_url
    ? `<img src="${company.logo_url}" alt="${company.name}" style="max-height:60px;max-width:200px;">`
    : '';
  const companyName = company.name;
  const companyFooter = company.settings?.email_branding?.footer_text ?? buildEmailFooter(company);
  const companyAddress = buildCompanyAddress(company);

  let subject = '';
  let html = '';

  switch (emailType) {
    case 'booking_confirmation': {
      subject = customSubject || `Reserva confirmada - ${companyName}`;
      const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
      if (customBody) {
        html = interpolateSafe(customBody, data as Record<string, unknown>);
      } else {
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  ${headerBlock}
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
      const btnText = customButtonText || 'Ver factura PDF';
      const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
      if (customBody) {
        html = interpolateSafe(customBody, data as Record<string, unknown>);
      } else {
        const buttonHtml = data.invoice_url
          ? `<a href="${data.invoice_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
          : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  ${headerBlock}
  <h1 style="color:${primaryColor};text-align:center;">Factura ${invoiceNum}</h1>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${companyFooter}${company.nif ? ' · NIF: ' + company.nif : ''}</p>
  <p style="text-align:center;color:#999;font-size:11px;margin-top:10px;">En cumplimiento con el RGPD, sus datos serán tratados conforme a nuestra política de privacidad.</p>
</body>
</html>`;
      }
      break;
    }

    case 'quote': {
      const quoteNum = data.numero_presupuesto || '';
      subject = customSubject || `Presupuesto ${quoteNum} - ${companyName}`;
      const btnText = customButtonText || 'Ver presupuesto';
      const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
      if (customBody) {
        html = interpolateSafe(customBody, data as Record<string, unknown>);
      } else {
        const buttonHtml = data.quote_url
          ? `<a href="${data.quote_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
          : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  ${headerBlock}
  <h1 style="color:${primaryColor};text-align:center;">Presupuesto ${quoteNum}</h1>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${companyFooter}${company.nif ? ' · NIF: ' + company.nif : ''}</p>
</body>
</html>`;
      }
      break;
    }

    case 'consent': {
      subject = customSubject || `Solicitud de consentimiento RGPD - ${companyName}`;
      const btnText = customButtonText || 'Revisar y validar datos';
      const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
      if (customBody) {
        html = interpolateSafe(customBody, data as Record<string, unknown>);
      } else {
        const buttonHtml = data.consent_url
          ? `<a href="${data.consent_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
          : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  ${headerBlock}
  <h1 style="color:${primaryColor};text-align:center;">Solicitud de consentimiento RGPD</h1>
  <p style="text-align:center;">Solicitamos su consentimiento para el tratamiento de sus datos personales.</p>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${companyFooter}</p>
</body>
</html>`;
      }
      break;
    }

    case 'invite':
    case 'invite_owner': {
      // invite_owner: owner invitation — user will create company + fill billing details
      const isOwner = emailType === 'invite_owner';
      const roleLabel = data.role_label || (isOwner ? 'Propietario' : 'Miembro');
      subject = customSubject || (isOwner
        ? `Te han invitado a crear tu empresa en ${companyName}`
        : `Te han invitado a ${companyName}`);
      if (customBody) {
        html = interpolateSafe(customBody, data as Record<string, unknown>);
      } else {
        const btnText = customButtonText || (isOwner ? 'Aceptar e introducir datos de empresa' : 'Aceptar invitación');
        const buttonHtml = data.invite_url
          ? `<a href="${data.invite_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
          : '';
        const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
        const inviterLine = data.inviter_name
          ? `<p style="text-align:center;color:#6b7280;font-size:14px;">Invitación enviada por <strong>${data.inviter_name}</strong></p>`
          : '';
        const messageLine = data.message
          ? `<div style="background:#f9fafb;border-left:4px solid ${primaryColor};padding:12px 16px;margin:16px 0;font-style:italic;color:#374151;">"${data.message}"</div>`
          : '';
        const extraInfoOwner = isOwner
          ? `<p style="text-align:center;color:#6b7280;font-size:13px;">Como propietario, podrás configurar los datos de tu empresa, facturación y gestionar a tu equipo.</p>`
          : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:${fontFamily},sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  <h1 style="color:${primaryColor};text-align:center;font-size:22px;">${isOwner ? 'Invitación para crear tu empresa' : `Te han invitado a ${companyName}`}</h1>
  ${inviterLine}
  <p style="text-align:center;font-size:16px;color:#374151;margin:20px 0;">
    Has recibido una invitación para unirte a <strong>${companyName}</strong>${!isOwner && data.role ? ` como <strong>${roleLabel}</strong>` : ''}.
  </p>
  ${messageLine}
  ${extraInfoOwner}
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;margin-top:24px;">${companyFooter}</p>
</body>
</html>`;
      }
      break;
    }

    case 'invite_admin':
    case 'invite_member':
    case 'invite_professional':
    case 'invite_agent':
    case 'invite_marketer':
    case 'invite_client': {
      // Role-specific staff/client invitation templates
      const roleLabels: Record<string, string> = {
        invite_admin: 'Administrador',
        invite_member: 'Miembro',
        invite_professional: 'Profesional',
        invite_agent: 'Agente',
        invite_marketer: 'Marketing',
        invite_client: 'Cliente',
      };
      const defaultLabel = roleLabels[emailType] || 'Miembro';
      const displayRoleLabel = data.role_label || defaultLabel;
      const isClient = emailType === 'invite_client';
      subject = customSubject || (isClient
        ? `Te han invitado a unirte a ${companyName}`
        : `Te han invitado a ${companyName} como ${displayRoleLabel}`);
      if (customBody) {
        html = interpolateSafe(customBody, data as Record<string, unknown>);
      } else {
        const btnText = customButtonText || 'Aceptar invitación';
        const buttonHtml = data.invite_url
          ? `<a href="${data.invite_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
          : '';
        const inviterLine = data.inviter_name
          ? `<p style="text-align:center;color:#6b7280;font-size:14px;">Invitación enviada por <strong>${data.inviter_name}</strong></p>`
          : '';
        const messageLine = data.message
          ? `<div style="background:#f9fafb;border-left:4px solid ${primaryColor};padding:12px 16px;margin:16px 0;font-style:italic;color:#374151;">"${data.message}"</div>`
          : '';
        const clientNote = isClient
          ? `<p style="text-align:center;color:#6b7280;font-size:13px;">Después de aceptar, podrás acceder al portal de clientes de ${companyName} para gestionar tus reservas y documentos.</p>`
          : `<p style="text-align:center;color:#6b7280;font-size:13px;">Después de aceptar la invitación, tendrás acceso al panel de ${companyName}.</p>`;
        const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:${fontFamily},sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  ${headerBlock}
  <h1 style="color:${primaryColor};text-align:center;font-size:22px;">Te han invitado a ${companyName}</h1>
  ${!isClient ? `<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>${displayRoleLabel}</strong></p>` : ''}
  ${inviterLine}
  ${messageLine}
  ${clientNote}
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;margin-top:24px;">${companyFooter}${companyAddress ? ' · ' + companyAddress : ''}</p>
</body>
</html>`;
      }
      break;
    }

    case 'waitlist': {
      const heading = data.heading || '¡Estás en la lista!';
      const bodyText = data.body_text || 'Te avisaremos cuando puedas reservar.';
      subject = customSubject || heading;
      const btnText = customButtonText || 'Reservar ahora';
      const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
      if (customBody) {
        html = interpolateSafe(customBody, data as Record<string, unknown>);
      } else {
        const buttonHtml = data.waitlist_url
          ? `<a href="${data.waitlist_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
          : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="background:linear-gradient(135deg,${primaryColor},#1e40af);padding:30px 20px;text-align:center;">
    <span style="color:#fff;font-size:18px;font-weight:bold;">Simplifica CRM</span>
  </div>
  ${headerBlock}
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
      const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
      const clientList = (data.client_names || []).map((name: string) => `<li style="padding:4px 0;">${sanitizeText(name, 200)}</li>`).join('');
      if (customBody) {
        html = interpolateSafe(customBody, data as Record<string, unknown>);
      } else {
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  ${headerBlock}
  <h1 style="color:${primaryColor};text-align:center;">Clientes inactivos</h1>
  <p>Los siguientes clientes no han tenido actividad reciente:</p>
  <ul style="list-style:none;padding:0;">${clientList}</ul>
  <p style="text-align:center;color:#666;font-size:12px;margin-top:20px;">${companyFooter} - Este es un mensaje automático</p>
</body>
</html>`;
      }
      break;
    }

    case 'google_review': {
      const clientName = data.client_name || '';
      const reviewUrl = data.review_url || 'https://g.page/review';
      subject = customSubject || `¡Gracias por tu visita, ${clientName}! 🌟`;
      const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
      if (customBody) {
        html = interpolateSafe(customBody, data as Record<string, unknown>);
      } else {
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:24px 0;">${companyLogo}</div>
  ${headerBlock}
  <h1 style="color:${primaryColor};text-align:center;font-size:24px;">¡Gracias por tu visita${clientName ? ', ' + clientName : ''}!</h1>
  <p style="text-align:center;font-size:16px;color:#555;margin:16px 0;">Tu opinión nos ayuda a seguir mejorando y a dar a conocer nuestro trabajo.</p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${reviewUrl}" style="display:inline-block;background:#4285f4;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">
      ★★★★★ Dejar Google Review
    </a>
  </div>
  <p style="text-align:center;color:#888;font-size:13px;margin-top:24px;">${companyFooter}</p>
  <p style="text-align:center;color:#ccc;font-size:11px;margin-top:8px;">Si ya has dejado tu opinión, ¡gracias! Este email solo se envía a clientes que han dado su consentimiento.</p>
</body>
</html>`;
      }
      break;
    }

    // ── budget_created / budget_reminder / budget_overdue ─────
    // Sent by the send-budget-notification Edge Function (see
    // supabase/functions/send-budget-notification/). The data payload
    // already includes a localised subject (so we do NOT override it
    // with customSubject — the trigger-driven subject is canonical) and
    // a rich set of template variables. If the company has configured
    // a custom body in company_email_settings, we use that verbatim;
    // otherwise we render a sensible default per kind.
    case 'budget_created':
    case 'budget_reminder':
    case 'budget_overdue': {
      const kind = emailType as 'budget_created' | 'budget_reminder' | 'budget_overdue';
      const dataSubject =
        kind === 'budget_created'   ? `Nuevo presupuesto ${data.period_label || ''} — ${data.total_formatted || ''}`.trim()
        : kind === 'budget_reminder' ? `Tu presupuesto vence pronto — ${data.total_formatted || ''}`.trim()
        :                              `Presupuesto vencido — ${data.total_formatted || ''}`.trim();
      subject = customSubject || dataSubject || `Presupuesto ${data.period_label || ''} - ${companyName}`.trim();
      const btnText = customButtonText || data.cta_text || 'Ver presupuesto';
      const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
      if (customBody) {
        html = interpolateSafe(customBody, data as Record<string, unknown>);
      } else {
        const intro = data.intro ||
          (kind === 'budget_created'
            ? 'Ya está disponible tu presupuesto.'
            : kind === 'budget_reminder'
              ? 'Tu presupuesto vence pronto.'
              : 'Tu presupuesto ha vencido y aún no hemos recibido el pago.');
        const clientLine = data.client_name
          ? `<p style="text-align:center;font-size:16px;color:#374151;margin:20px 0;">Hola <strong>${data.client_name}</strong>,</p>`
          : '';
        const buttonHtml = data.payment_url
          ? `<a href="${data.payment_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">${btnText}</a>`
          : '';
        // Accent strip color depends on the kind
        const accentColor = kind === 'budget_overdue' ? '#dc2626' : kind === 'budget_reminder' ? '#f59e0b' : primaryColor;
        const headingColor = kind === 'budget_overdue' ? '#dc2626' : primaryColor;
        const headingText =
          kind === 'budget_created'   ? 'Nuevo presupuesto disponible'
          : kind === 'budget_reminder' ? 'Tu presupuesto vence pronto'
          :                              'Presupuesto vencido';
        const dueLine = data.due_date_formatted
          ? `<p style="text-align:center;color:#6b7280;font-size:14px;margin:4px 0;">Fecha de vencimiento: <strong>${data.due_date_formatted}</strong></p>`
          : '';
        const periodLine = data.period_label
          ? `<p style="text-align:center;color:#6b7280;font-size:14px;margin:4px 0;">Periodo: <strong>${data.period_label}</strong></p>`
          : '';
        const totalLine = data.total_formatted
          ? `<p style="text-align:center;color:#111;font-size:28px;font-weight:bold;margin:12px 0;">${data.total_formatted}</p>`
          : '';
        const daysToDueLine = (typeof data.days_to_due === 'number' && kind !== 'budget_created')
          ? `<p style="text-align:center;color:${kind === 'budget_overdue' ? '#dc2626' : '#f59e0b'};font-size:14px;font-weight:bold;margin:4px 0;">${
              data.days_to_due < 0
                ? `Vencido hace ${Math.abs(data.days_to_due)} día${Math.abs(data.days_to_due) === 1 ? '' : 's'}`
                : data.days_to_due === 0
                  ? (kind === 'budget_overdue' ? 'Vence hoy' : 'Vence hoy')
                  : `Vence en ${data.days_to_due} día${data.days_to_due === 1 ? '' : 's'}`
            }</p>`
          : '';
        const footerLine = data.footer_text
          ? `<p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">${data.footer_text}</p>`
          : '';
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:${fontFamily},sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:${backgroundColor};">
  <div style="background:${accentColor};height:6px;"></div>
  <div style="padding:24px 20px;">
    <div style="text-align:center;padding:16px 0;">${companyLogo}</div>
    ${headerBlock}
    <h1 style="color:${headingColor};text-align:center;font-size:22px;margin:20px 0 4px 0;">${headingText}</h1>
    ${clientLine}
    <p style="text-align:center;font-size:16px;color:#374151;margin:12px 0 4px 0;">${intro}</p>
    ${periodLine}
    ${dueLine}
    ${daysToDueLine}
    ${totalLine}
    <div style="text-align:center;">${buttonHtml}</div>
    ${footerLine}
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:24px;">${companyFooter}${company.nif ? ' · NIF: ' + company.nif : ''}</p>
    </div>
    </body>
    </html>`;
    }
    break;
    }

    // ── booking_change: created / updated / rescheduled / cancelled / deleted ──
    // Sent by notify-booking-change Edge Function. Variables:
    //   data.change_type: 'created'|'updated'|'rescheduled'|'cancelled'|'deleted'
    //   data.client_name, data.professional_name, data.service_name
    //   data.starts_at, data.ends_at, data.previous_starts_at (only on rescheduled)
    //   data.reason (optional, e.g. cancellation reason)
    //   data.booking_url (optional link to client portal)
    case 'booking_change': {
    const changeType = (data.change_type as string) || 'updated';
    const audience = (data.audience as string) || 'client'; // client | professional | admin
    const verbByType: Record<string, string> = {
    created: 'Nueva reserva creada',
    updated: 'Tu reserva se ha modificado',
    rescheduled: 'Tu reserva se ha reprogramado',
    cancelled: 'Tu reserva se ha cancelado',
    deleted: 'Tu reserva se ha eliminado',
    };
    const audiencePrefix = audience === 'admin' ? '[Admin] ' : '';
    const dataSubject = `${audiencePrefix}${verbByType[changeType] || verbByType.updated}${data.service_name ? ' — ' + data.service_name : ''}`;
    subject = customSubject || dataSubject || `${audiencePrefix}Actualización de reserva — ${companyName}`;

    const btnText = customButtonText || data.cta_text || (audience === 'client' ? 'Ver reserva' : 'Ver detalles');
    const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
    if (customBody) {
    html = interpolateSafe(customBody, data as Record<string, unknown>);
    } else {
    // Accent color depends on the change type
    const accentColor =
      changeType === 'cancelled' || changeType === 'deleted' ? '#dc2626' :
      changeType === 'rescheduled' ? '#f59e0b' :
      primaryColor;
    const headingColor =
      changeType === 'cancelled' || changeType === 'deleted' ? '#dc2626' : primaryColor;
    const headingText = verbByType[changeType] || verbByType.updated;

    const intro = data.intro ||
      (audience === 'client'
        ? (changeType === 'created' ? 'Te confirmamos la siguiente reserva:' : 'Los detalles de tu reserva han cambiado:')
        : audience === 'professional'
          ? (changeType === 'created' ? 'Tienes una nueva reserva asignada:' : 'Una de tus reservas ha cambiado:')
          : 'Una reserva en tu empresa ha cambiado:');

    const greet = (data.audience_name as string)
      ? `<p style="text-align:center;font-size:16px;color:#374151;margin:20px 0;">Hola <strong>${data.audience_name}</strong>,</p>`
      : '';

    const serviceLine = data.service_name
      ? `<p style="text-align:center;color:#111;font-size:18px;font-weight:600;margin:12px 0;">${data.service_name}</p>`
      : '';

    const dateLine = data.starts_at
      ? `<p style="text-align:center;color:#374151;font-size:15px;margin:8px 0;"><strong>Fecha y hora:</strong> ${data.starts_at}${data.ends_at ? ' — ' + data.ends_at : ''}</p>`
      : '';

    const previousDateLine = data.previous_starts_at && changeType === 'rescheduled'
      ? `<p style="text-align:center;color:#6b7280;font-size:13px;margin:4px 0;text-decoration:line-through;">Anterior: ${data.previous_starts_at}</p>`
      : '';

    const clientLine = data.client_name && audience !== 'client'
      ? `<p style="text-align:center;color:#374151;font-size:14px;margin:4px 0;">Cliente: <strong>${data.client_name}</strong></p>`
      : '';

    const professionalLine = data.professional_name && audience !== 'professional'
      ? `<p style="text-align:center;color:#374151;font-size:14px;margin:4px 0;">Profesional: <strong>${data.professional_name}</strong></p>`
      : '';

    const reasonLine = data.reason
      ? `<p style="text-align:center;color:#6b7280;font-size:13px;font-style:italic;margin:8px 0;">Motivo: ${data.reason}</p>`
      : '';

    const buttonHtml = data.booking_url
      ? `<a href="${data.booking_url}" style="display:inline-block;background:${primaryColor};color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">${btnText}</a>`
      : '';

    const footerLine = data.footer_text
      ? `<p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">${data.footer_text}</p>`
      : '';

    html = `<!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:${fontFamily},sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:${backgroundColor};">
    <div style="background:${accentColor};height:6px;"></div>
    <div style="padding:24px 20px;">
    <div style="text-align:center;padding:16px 0;">${companyLogo}</div>
    ${headerBlock}
    <h1 style="color:${headingColor};text-align:center;font-size:22px;margin:20px 0 4px 0;">${headingText}</h1>
    ${greet}
    <p style="text-align:center;font-size:16px;color:#374151;margin:12px 0 4px 0;">${intro}</p>
    ${serviceLine}
    ${dateLine}
    ${previousDateLine}
    ${clientLine}
    ${professionalLine}
    ${reasonLine}
    <div style="text-align:center;">${buttonHtml}</div>
    ${footerLine}
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:24px;">${companyFooter}${company.nif ? ' · NIF: ' + company.nif : ''}</p>
    </div>
    </body>
    </html>`;
    }
    break;
    }

    default: {
      subject = customSubject || `Mensaje de ${companyName}`;
      const message = data.message || '';
      const headerBlock = customHeader ? `<div style="padding:16px 0;">${interpolateSafe(customHeader, data as Record<string, unknown>)}</div>` : '';
      if (customBody) {
        html = interpolateSafe(customBody, data as Record<string, unknown>);
      } else {
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
  ${headerBlock}
  <p style="font-size:16px;">${message}</p>
  <p style="text-align:center;color:#666;font-size:12px;margin-top:20px;">${companyFooter}</p>
</body>
</html>`;
      }
    }
  }

  // Apply email_branding: inject font-family and background-color into <body> style
  if (html) {
    html = html.replace(
      'font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;',
      `font-family:${fontFamily},sans-serif;background-color:${backgroundColor};max-width:600px;margin:0 auto;padding:20px;color:#333;`,
    );
  }

  // Append CAN-SPAM / GDPR / Hotmail-compliance footer (physical address,
  // privacy policy, unsubscribe link). Applied to every emailType including
  // customBody so operators can't accidentally send without compliance.
  if (html) {
    html = appendComplianceFooter(html, company, company.id);
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
  replyToEmail?: string,
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

  // Set Reply-To so replies go to the operator's real mailbox (typically GWS)
  // rather than the no-reply From address. Critical for transactional emails
  // where the From is a system address (e.g. noreply@caibs.es) but the reply
  // should land in the operator's personal inbox.
  if (replyToEmail && replyToEmail !== fromEmail) {
    params.append('ReplyToAddresses.member.1', replyToEmail);
  }

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

// ── SMTP sender (Google Workspace / any SMTP) ─────────────────────────────────

interface SMTPSenderResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function sendViaSMTP(
  smtpHost: string,
  smtpPort: number,
  smtpUser: string,
  smtpPassword: string,
  fromEmail: string,
  fromName: string | null,
  toEmails: string[],
  subject: string,
  htmlBody: string,
  replyToEmail?: string,
): Promise<SMTPSenderResult> {
  try {
    // Dynamic import — keeps boot fast and avoids ESM-incompat issues with
    // older nodemailer. Only loaded when SMTP path is actually used.
    const { default: nodemailer } = await import('https://esm.sh/nodemailer@6.9.16');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
      tls: { rejectUnauthorized: false },
    });

    const safeName = fromName ? fromName.replace(/[\r\n"<>]/g, '').substring(0, 200) : '';
    const fromAddress = safeName ? `"${safeName}" <${fromEmail}>` : fromEmail;

    const info = await transporter.sendMail({
      from: fromAddress,
      // replyTo set explicitly so it differs from From when needed (GWS users
      // want their replies to land in their personal Gmail, not in the system
      // From address which may be a no-reply alias).
      replyTo: replyToEmail && replyToEmail !== fromEmail ? replyToEmail : undefined,
      to: toEmails.join(', '),
      subject: subject.replace(/[\r\n]/g, '').substring(0, 998),
      html: htmlBody.substring(0, 200000),
    });

    return { success: true, messageId: info.messageId ?? 'unknown' };
  } catch (err: any) {
    return { success: false, error: err.message || 'SMTP send failed' };
  }
}

// ── Gmail API sender (OAuth2) ───────────────────────────────────────────────────

interface GmailSenderResult {
  success: boolean;
  messageId?: string;
  error?: string;
  gmailApiFallbackTriggered?: boolean;
}

async function sendViaGmailAPI(
  account: EmailAccount,
  fromEmail: string,
  fromName: string | null,
  toEmails: string[],
  subject: string,
  htmlBody: string,
  replyToEmail?: string,
): Promise<GmailSenderResult> {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';

  // Decrypt refresh token
  const { data: refreshToken, error: decryptErr } = await supabaseAdmin.rpc('decrypt_text', {
    encrypted_hex: account.oauth_refresh_token!,
    key: encryptionKey,
  });

  if (decryptErr || !refreshToken) {
    console.error('[send-branded-email] OAuth refresh token decryption failed for account:', account.id);
    return { success: false, error: 'oauth_token_decryption_failed' };
  }

  // Dynamic import to avoid circular issues
  const { GmailAPIProvider } = await import('./providers/gmail-api-provider.ts');
  const provider = new GmailAPIProvider(refreshToken, account.id, supabaseAdmin);

  try {
    const result = await provider.send({
      from: { email: fromEmail, name: fromName ?? undefined },
      to: toEmails,
      subject,
      html: htmlBody,
      replyTo: replyToEmail,
    });

    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error?.message,
      gmailApiFallbackTriggered: false,
    };
  } catch (err: any) {
    console.error('[send-branded-email] Gmail API error:', err.message);
    return { success: false, error: err.message };
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
    // ── Rate limiting: stricter for internal calls (X-Internal-Call) ─────
    // Rafter v0.23 F-08 fix: separate Redis keys for user vs internal calls.
    // Previously both branches shared the same `send-branded-email:${ip}` key,
    // so an attacker with `X-Internal-Call: true` could drain the 2/min
    // internal budget and then switch to the 20/min user budget on the same
    // counter. Now user and internal calls track independent counters.
    const isInternalCall = req.headers.get('X-Internal-Call') === 'true';
    const rlLimit = isInternalCall ? 2 : 20;
    const rlWindow = 60000;
    const clientIP = getClientIP(req);
    const rlKeyPrefix = isInternalCall ? 'send-branded-email-internal' : 'send-branded-email';
    const rl = await checkRateLimit(`${rlKeyPrefix}:${clientIP}`, rlLimit, rlWindow);
    if (!rl.allowed) {
      const msg = isInternalCall
        ? 'Demasiadas solicitudes internas. Máximo 2 emails/minuto.'
        : 'Demasiadas solicitudes. Máximo 20 emails/minuto.';
      return jsonError(429, msg, req);
    }

    // ── Authenticate ────────────────────────────────────────────────────────
    // Require valid JWT from real user. System fallback removed to prevent
    // unauthenticated invocations from other Edge Functions without a real token.
    // Internal calls from other Edge Functions can use SERVICE_ROLE_KEY.
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isServiceRoleCall = authHeader.length > 0 && authHeader === serviceRoleKey;

    let userId: string;
    let isInternalServiceCall = false;

    if (isServiceRoleCall) {
      // Internal service call: skip user JWT validation, trust the service role.
      // These calls come from other Edge Functions (e.g. booking-public).
      isInternalServiceCall = true;
      userId = '__service_role__';
      console.info('[send-branded-email] Internal service call (service role):', {
        ip: getClientIP(req),
        timestamp: new Date().toISOString(),
      });
    } else {
      // Regular user JWT
      try {
        const user = await getAuthUser(req, supabaseAdmin);
        userId = user.id;

        // Rafter v0.23 F-11 fix: per-user rate limit (5/hour) on top of the
        // per-IP limit. A compromised JWT from one IP could otherwise drain
        // SES quotas or spam branded emails. Tighter per-user cap protects
        // the SES bill from authenticated abuse. Service-role/internal calls
        // are exempt because they have no user concept.
        const userRl = await checkRateLimit(`send-branded-email:user:${userId}`, 5, 3_600_000);
        if (!userRl.allowed) {
          return jsonError(429, 'Demasiadas solicitudes para este usuario. Máximo 5 emails/hora.', req);
        }
      } catch (authErr: any) {
        console.warn('[send-branded-email] Auth failed:', authErr?.message);
        return jsonError(401, 'No autorizado: token inválido o expirado', req);
      }
    }

    // Audit log for authenticated system calls (internal functions that pass a real JWT).
    // Note: `isInternalCall` is already declared above in the rate-limit block; reuse it
    // (was previously redeclared as `const`, which is a SyntaxError in the same scope
    // and caused the function to fail to boot with BOOT_ERROR).
    if (isInternalCall) {
      console.info('[send-branded-email] Internal call:', {
        userId,
        ip: getClientIP(req),
        timestamp: new Date().toISOString(),
      });
    }

    // ── Parse input ─────────────────────────────────────────────────────────
    const body = await req.json();
    const { companyId, emailType, to, subject: subjectOverride, data: templateData = {} } = body;

    if (!companyId || !isValidUUID(companyId)) {
      return jsonError(400, 'companyId inválido o faltante', req);
    }

    if (!emailType || !EMAIL_TYPES.includes(emailType)) {
      return jsonError(400, `emailType inválido. Valores: ${EMAIL_TYPES.join(', ')}`, req);
    }

    if (!Array.isArray(to) || to.length === 0 || to.length > 50) {
      return jsonError(400, '"to" debe ser un array con 1-50 destinatarios', req);
    }

    // Validate recipients
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipients: Recipient[] = [];
    for (const t of to) {
      const email = sanitizeEmail(t?.email);
      if (!email || !emailRx.test(email)) {
        return jsonError(400, `Email de destinatario inválido: ${t?.email}`, req);
      }
      recipients.push({ email, name: typeof t.name === 'string' ? t.name.slice(0, 200) : '' });
    }

    const subject = sanitizeSubject(subjectOverride);

    // ── Validate user has access to this company ────────────────────────────
    // Skip for internal service role calls (they come from trusted Edge Functions)
    let memberData: any = { company_id: companyId };
    if (!isInternalServiceCall) {
      const { data } = await supabaseClient
        .from('company_members')
        .select('company_id')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .single();
      memberData = data;
    }

    if (!memberData) {
      return jsonError(403, 'No tienes acceso a esta empresa', req);
    }

    // ── Additional company existence validation ──────────────────────────────
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id, name, logo_url, nif, settings')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return jsonError(404, 'Empresa no encontrada', req);
    }

    // ── Fetch email setting for this company+emailType ──────────────────────
    const { data: emailSetting } = await supabaseClient
      .from('company_email_settings')
      .select('email_account_id, fallback_account_id, custom_subject_template, custom_body_template, custom_header_template, custom_button_text')
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
      emailSetting?.custom_header_template,
      emailSetting?.custom_button_text,
    );

    const emailSubject = subject || finalSubject;

    // ── Prepare send params ─────────────────────────────────────────────────
    // No silent fallback to a hardcoded noreply. If we can't find a real
    // company email account, FAIL LOUDLY — otherwise the recipient sees a
    // misleading From address and replies go to a no-reply inbox nobody
    // monitors. Operators must explicitly configure their sender email
    // (e.g. miriamblesa@caibs.es) via the admin panel.
    if (!account) {
      console.error(`[send-branded-email] No active email account found for company ${companyId}, emailType=${emailType}. Refusing to send with a hardcoded noreply fallback.`);
      return jsonError(500, 'No hay una cuenta de email corporativa configurada para esta empresa. Configúrala en Admin → Email Accounts antes de enviar.', req);
    }
    const fromEmail = account?.ses_from_email || account?.email;
    const fromName = account?.display_name || company.name;
    // Reply-To defaults to the account's corporate email (the one that the
    // operator monitors in their GWS/regular inbox). If the company has set a
    // dedicated reply-to address in their settings, use that. Otherwise fall
    // back to the fromEmail so replies flow back to the same mailbox the
    // operator already manages in Gmail.
    const replyToEmail = (emailSetting as any)?.reply_to_email || account?.email || fromEmail;
    const toEmails = recipients.map(r => r.email);

    // ── Route by provider type and send ──────────────────────────────────────
    const providerType = account?.provider_type ?? 'ses_shared';
    let sendResult: SESSenderResult & SMTPSenderResult;
    let awsRegion = Deno.env.get('AWS_REGION') ?? 'eu-west-1';

    if (providerType === 'google_workspace') {
      const authMethod = account?.auth_method;
      const hasOAuth = authMethod === 'oauth2' && !!account?.oauth_refresh_token;
      const hasSMTP = !!account?.smtp_host && !!account?.smtp_user && !!account?.smtp_encrypted_password;

      if (hasOAuth) {
        // ── Gmail API path (OAuth2) ─────────────────────────────────────────
        const gmailResult = await sendViaGmailAPI(
          account,
          fromEmail,
          fromName,
          toEmails,
          emailSubject,
          htmlBody,
          replyToEmail,
        );

        if (!gmailResult.success) {
          // Fallback to SMTP if Gmail API fails and SMTP is configured
          console.warn(`[send-branded-email] Gmail API failed for account ${accountId}, falling back to SMTP: ${gmailResult.error}`);
          if (hasSMTP) {
            const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
            const { data: smtpPw } = await supabaseAdmin.rpc('decrypt_text', {
              encrypted_hex: account.smtp_encrypted_password!,
              key: encryptionKey,
            });
            if (smtpPw) {
              sendResult = await sendViaSMTP(
                account.smtp_host!, account.smtp_port ?? 587, account.smtp_user!, smtpPw,
                fromEmail, fromName, toEmails, emailSubject, htmlBody, replyToEmail,
              );
              // Mark that we fell back
              (sendResult as any).gmail_api_fallback_triggered = true;
            } else {
              sendResult = { success: false, error: `gmail_api_failed:${gmailResult.error}` };
            }
          } else {
            sendResult = { success: false, error: `gmail_api_failed:${gmailResult.error}` };
          }
        } else {
          sendResult = { success: true, messageId: gmailResult.messageId };
        }
      } else if (hasSMTP) {
        // ── SMTP path (existing) ─────────────────────────────────────────────
        const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
        const { data: decryptedPassword, error: decryptErr } = await supabaseAdmin.rpc('decrypt_text', {
          encrypted_hex: account.smtp_encrypted_password!,
          key: encryptionKey,
        });

        if (decryptErr || !decryptedPassword) {
          console.error('[send-branded-email] SMTP password decryption failed for account:', accountId);
          sendResult = { success: false, error: 'SMTP password decryption failed' };
        } else {
          sendResult = await sendViaSMTP(
            account.smtp_host!,
            account.smtp_port ?? 587,
            account.smtp_user!,
            decryptedPassword,
            fromEmail,
            fromName,
            toEmails,
            emailSubject,
            htmlBody,
            replyToEmail,
          );
        }
      } else {
        // Google Workspace account exists but no OAuth or SMTP configured.
        // Fall back to ses_shared (system AWS SES credentials).
        console.warn('[send-branded-email] Google Workspace account not configured, falling back to SES shared');
        providerType = 'ses_shared';
      }
    }

    if (providerType === 'ses_iam') {
      // Dedicated IAM credentials for this company
      const encryptedSecret = account?.smtp_encrypted_password;
      const iamAccessKeyId = account?.iam_access_key_id;
      const iamArn = account?.iam_user_arn;

      if (!encryptedSecret || !iamAccessKeyId || !iamArn) {
        console.warn('[send-branded-email] ses_iam not fully provisioned, falling back to ses_shared');
        providerType = 'ses_shared';
      } else {
        // ── Decrypt IAM secret (never log decrypted values) ────────────────────
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
    const { data: decryptedSecret, error: decryptErr } = await supabaseAdmin.rpc('decrypt_text', {
      encrypted_hex: encryptedSecret,
      key: encryptionKey,
    });

    if (decryptErr || !decryptedSecret) {
      console.error('[send-branded-email] IAM secret decryption failed for account:', accountId);
      sendResult = { success: false, error: 'IAM secret decryption failed' };
    } else {
      sendResult = await sendViaSES(
        awsRegion,
        iamAccessKeyId,
        decryptedSecret,
        fromEmail,
        fromName,
        toEmails,
        emailSubject,
        htmlBody,
        replyToEmail,
      );
    }
      }
    } else {
      // ses_shared — use global Simplifica AWS credentials
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
          replyToEmail,
        );
      }
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
        gmail_api_fallback_triggered: (sendResult as any).gmail_api_fallback_triggered ?? false,
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
      }, req);
    } else {
      return jsonError(500, `Error al enviar email: ${sendResult.error}`, req);
    }
  } catch (error: any) {
    console.error('[send-branded-email] Error:', error?.message, error?.stack);
    return jsonError(error.status || 500, error.message || 'Error interno del servidor', req);
  }
});

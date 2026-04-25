// Edge Function: send-invite-email
// Purpose: Send custom branded HTML invitation email via AWS SES.
//   Receives invitation details and sends a professional HTML email with accept button.
//
// Auth: JWT required (must be invited by a valid user)
//
// Payload:
//   { email, role, company_name, inviter_name, token, accept_url? }
//   - email: recipient email address
//   - role: invited role (admin, member, client, professional)
//   - company_name: name of the company inviting
//   - inviter_name: name of the person sending the invite
//   - token: invitation token for acceptance
//   - accept_url: (optional) custom accept URL, defaults to app.simplificacrm.es/invite

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, SECURITY_HEADERS } from '../_shared/security.ts';
import {
  GetSendQuotaCommand,
  SESClient,
  SendEmailCommand,
} from 'npm:@aws-sdk/client-ses@3';

function getAwsErrorDetails(error: unknown) {
  const awsError = error as {
    name?: string;
    message?: string;
    Code?: string;
    Type?: string;
    $metadata?: {
      requestId?: string;
      httpStatusCode?: number;
    };
  };

  return {
    name: awsError?.name ?? null,
    message: awsError?.message ?? null,
    code: awsError?.Code ?? null,
    type: awsError?.Type ?? null,
    requestId: awsError?.$metadata?.requestId ?? null,
    httpStatusCode: awsError?.$metadata?.httpStatusCode ?? null,
  };
}

// ── Main handler ────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || undefined;
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    const optionsResponse = handleCorsOptions(req);
    if (optionsResponse) return optionsResponse;
    return new Response('ok', { headers: corsHeaders });
  }

  // Rate limiting: 10 req/min per IP (sends SES emails)
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`send-invite-email:${ip}`, 10, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ success: false, error: 'Too many requests' }), {
      status: 429,
      headers: {
        ...corsHeaders,
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json',
        ...getRateLimitHeaders(rl),
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] }),
      {
        status: 405,
        headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    // ── AWS SES credentials ────────────────────────────────────────────────
    const AWS_ACCESS_KEY_ID = (Deno.env.get('AWS_ACCESS_KEY_ID') ?? '').trim();
    const AWS_SECRET_ACCESS_KEY = (Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '').trim();
    const REGION = (Deno.env.get('AWS_REGION') ?? 'us-east-1').trim();
    const FROM_EMAIL = (Deno.env.get('SES_FROM_ADDRESS') ?? 'notifications@simplificacrm.es').trim();
    const APP_URL = (Deno.env.get('APP_URL') ?? 'https://app.simplificacrm.es').trim();
    const CLIENT_PORTAL_URL =
      (Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://portal.simplificacrm.es').trim();

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      console.error('send-invite-email: Missing AWS credentials');
      return new Response(JSON.stringify({ success: false, error: 'missing_aws_credentials' }), {
        status: 500,
        headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    console.log(`send-invite-email: Using region=${REGION}, from=${FROM_EMAIL}`);

    // ── Auth: verify JWT is present and valid ──────────────────────────────
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    console.log('send-invite-email: DEBUG AUTH', {
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader ? authHeader.substring(0, 20) + '...' : null,
      authHeaderLength: authHeader.length,
    });

    if (!authHeader.startsWith('Bearer ')) {
      console.error('send-invite-email: Auth header missing Bearer prefix');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'unauthorized',
          message: 'Authorization required',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('send-invite-email: Missing Supabase config', {
        hasUrl: !!SUPABASE_URL,
        hasKey: !!SERVICE_ROLE_KEY,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'missing_env',
          message: 'Missing Supabase config',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Detect service-role calls (inter-function). The SERVICE_ROLE_KEY bypasses
    // Supabase gateway JWT verification. When another edge function calls us with
    // the service key, we trust it as an internal call and skip JWT user validation.
    const isServiceRoleCall = token === SERVICE_ROLE_KEY;

    if (isServiceRoleCall) {
      console.log('send-invite-email: service-role call detected, skipping JWT validation');
    } else {
      const { data: userFromToken, error: tokenErr } = await supabaseAdmin.auth.getUser(token);
      console.log('send-invite-email: JWT validation', {
        tokenErr: tokenErr ? { message: tokenErr.message, status: tokenErr.status } : null,
        userId: userFromToken?.user?.id || null,
      });

      if (tokenErr || !userFromToken?.user?.id) {
        console.error('send-invite-email: JWT validation failed', {
          tokenErr,
          hasUser: !!userFromToken?.user?.id,
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: 'unauthorized',
            message: 'Invalid auth token',
            debug: { tokenErr: tokenErr?.message },
          }),
          {
            status: 401,
            headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
          },
        );
      }

      console.log('send-invite-email: JWT valid, userId:', userFromToken.user.id);
    }

    // ── Parse and validate payload ─────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const role = String(body?.role || 'member').trim();
    const companyName = String(body?.company_name || 'una empresa').trim();
    const inviterName = String(body?.inviter_name || 'Alguien').trim();
    const inviteToken = String(body?.token || '').trim();
    const customAcceptUrl = body?.accept_url ? String(body?.accept_url).trim() : null;
    const companyId = body?.company_id ? String(body.company_id).trim() : null;

    // ── Fetch email branding from DB ───────────────────────────────────────
    // Always load Simplifica's branding as the base. If the inviting company
    // has its own branding set, those values override Simplifica's defaults.
    const SIMPLIFICA_COMPANY_ID = '30b6c6b9-f622-4857-987d-8b7bb461c893';

    type BrandingRow = { logo_url: string | null; settings: Record<string, any>; name: string };

    const fetchBranding = async (id: string): Promise<BrandingRow | null> => {
      const { data } = await supabaseAdmin
        .from('companies')
        .select('logo_url, settings, name')
        .eq('id', id)
        .single();
      return data as BrandingRow | null;
    };

    let logoUrl: string | null = null;
    let primaryColor = '#2563EB';
    let bgColor = '#F3F4F6';
    let fontFamily = 'Helvetica, Arial, sans-serif';
    let footerBrand = 'Simplifica CRM';

    try {
      // Base: Simplifica's own branding
      const simplifica = await fetchBranding(SIMPLIFICA_COMPANY_ID);
      if (simplifica) {
        logoUrl = simplifica.logo_url || null;
        primaryColor = simplifica.settings?.branding?.primary_color || primaryColor;
        bgColor = simplifica.settings?.email_branding?.background_color || bgColor;
        fontFamily = simplifica.settings?.email_branding?.font_family
          ? `${simplifica.settings.email_branding.font_family}, sans-serif`
          : fontFamily;
        footerBrand = simplifica.settings?.email_branding?.footer_text || simplifica.name || footerBrand;
      }

      // Override: inviting company's branding (only fields that are set)
      if (companyId && companyId !== SIMPLIFICA_COMPANY_ID) {
        const company = await fetchBranding(companyId);
        if (company) {
          if (company.logo_url) logoUrl = company.logo_url;
          if (company.settings?.branding?.primary_color) primaryColor = company.settings.branding.primary_color;
          if (company.settings?.email_branding?.background_color) bgColor = company.settings.email_branding.background_color;
          if (company.settings?.email_branding?.font_family) fontFamily = `${company.settings.email_branding.font_family}, sans-serif`;
          if (company.settings?.email_branding?.footer_text) footerBrand = company.settings.email_branding.footer_text;
          else if (company.name) footerBrand = company.name;
        }
      }
    } catch (brandErr) {
      console.warn('send-invite-email: could not fetch branding', brandErr);
    }

    // Validate required fields
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'invalid_request',
          message: 'Valid email required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!inviteToken || inviteToken.length < 10) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'invalid_request',
          message: 'Valid token required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    // Sanitize inputs to prevent XSS
    const safeCompanyName = companyName.replace(/[<>"']/g, '').substring(0, 200);
    const safeInviterName = inviterName.replace(/[<>"']/g, '').substring(0, 100);
    const safeRole = role.replace(/[<>"']/g, '').substring(0, 50);

    // Determine accept URL based on role
    let acceptUrl: string;
    if (customAcceptUrl) {
      acceptUrl = customAcceptUrl;
    } else if (role === 'client') {
      acceptUrl = `${CLIENT_PORTAL_URL}/invite?token=${inviteToken}`;
    } else {
      acceptUrl = `${APP_URL}/invite?token=${inviteToken}`;
    }

    // Format role for display
    const roleDisplay: Record<string, string> = {
      owner: 'Propietario',
      admin: 'Administrador',
      member: 'Miembro',
      professional: 'Profesional',
      client: 'Cliente',
      agent: 'Agente',
    };
    const displayRole = roleDisplay[safeRole] || safeRole;

    // Build HTML email — escape backticks for JSON compatibility
    const subject = `Te han invitado a unirte a ${safeCompanyName} en Simplifica`;
    const safeMessage = body?.message
      ? String(body.message).replace(/[<>"']/g, '').substring(0, 500)
      : '';
    const personalMessageHtml = safeMessage
      ? `<div style="background-color: #fefce8; border-left: 4px solid #eab308; padding: 16px 20px; margin: 0 0 24px 0; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px; color: #713f12; font-style: italic;">&ldquo;${safeMessage}&rdquo;</p>
              </div>`
      : '';
    const logoImgHtml = logoUrl
      ? `<img src="${logoUrl}" alt="${safeCompanyName}" style="max-height: 60px; max-width: 200px; margin-bottom: 16px; display: block; margin-left: auto; margin-right: auto;">`
      : '';
    const htmlEscaped = htmlBodyTemplate
      // Branding placeholders
      .replace(/__PRIMARY_COLOR__/g, primaryColor)
      .replace(/__BG_COLOR__/g, bgColor)
      .replace(/__FONT_FAMILY__/g, fontFamily)
      .replace(/__LOGO_IMG__/g, logoImgHtml)
      .replace(/__FOOTER_BRAND__/g, footerBrand)
      // Per-email variables
      .replace(/\${acceptUrl}/g, acceptUrl)
      .replace(/\${safeInviterName}/g, safeInviterName)
      .replace(/\${safeCompanyName}/g, safeCompanyName)
      .replace(/\${displayRole}/g, displayRole)
      .replace(/\${email}/g, email)
      .replace(/\${personalMessage}/g, personalMessageHtml)
      .replace(/\$\{new Date\(\)\.getFullYear\(\)\}/, String(new Date().getFullYear()))
      .replace(
        /\$\{body\.message\?.*?:\s*''\}/gs,
        safeMessage,
      );
    const plainMessage = body?.message
      ? String(body.message)
          .replace(/\s+/g, ' ')
          .replace(/[<>"']/g, '')
          .substring(0, 500)
      : '';
    const textBody = [
      `${safeInviterName} te ha invitado a unirte a ${safeCompanyName} en Simplifica.`,
      `Rol asignado: ${displayRole}`,
      plainMessage ? `Mensaje: ${plainMessage}` : '',
      `Acepta la invitacion aqui: ${acceptUrl}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const ses = new SESClient({
      region: REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    // ── Send email via SES ─────────────────────────────────────────────────
    const safeSubject = subject.replace(/[\r\n]/g, ' ').substring(0, 998);

    console.log('send-invite-email: sending via SES SDK', {
      region: REGION,
      fromEmail: FROM_EMAIL,
      toEmail: email,
      subjectLen: safeSubject.length,
      htmlLen: htmlEscaped.length,
    });

    try {
      const sendResult = await ses.send(
        new SendEmailCommand({
          Source: FROM_EMAIL,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: safeSubject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: textBody, Charset: 'UTF-8' },
              Html: { Data: htmlEscaped.substring(0, 200000), Charset: 'UTF-8' },
            },
          },
        }),
      );

      console.log('send-invite-email: Email sent successfully', {
        to: email,
        messageId: sendResult.MessageId ?? null,
        requestId: sendResult.$metadata?.requestId ?? null,
      });
    } catch (sesError) {
      const awsErrorDetails = getAwsErrorDetails(sesError);
      console.error('send-invite-email: SES SDK error', awsErrorDetails);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ses_error',
          message: 'Failed to send invitation email',
          details: awsErrorDetails,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        to: email,
        role: safeRole,
        company_name: safeCompanyName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  } catch (error: any) {
    console.error('send-invite-email: Unhandled error:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: 'internal_error',
        message: error?.message || 'Error sending invitation email',
      }),
      {
        status: 500,
        headers: {
          ...getCorsHeaders(req),
          ...SECURITY_HEADERS,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});

// ── HTML template (outside handler to avoid template literal issues) ──────

const htmlBodyTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación</title>
</head>
<body style="margin: 0; padding: 0; font-family: __FONT_FAMILY__; background-color: __BG_COLOR__;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: __BG_COLOR__; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background: #ffffff; border-radius: 8px; overflow: hidden; max-width: 600px;">
          <!-- Logo header -->
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb; text-align: center;">
              __LOGO_IMG__
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #111827;">Hola,</p>
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #111827;">
                <strong>\${safeInviterName}</strong> te ha invitado a unirte a <strong>\${safeCompanyName}</strong>.
              </p>
              \${personalMessage}
              <p style="margin: 0 0 28px 0; font-size: 16px; color: #111827;">
                Para aceptar esta invitación, haz clic en el botón de abajo:
              </p>
              <div style="text-align: center;">
                <a href="\${acceptUrl}"
                   style="display: inline-block; background-color: __PRIMARY_COLOR__; color: #ffffff; padding: 12px 28px;
                          border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
                  Aceptar Invitación
                </a>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;
                       text-align: center; font-size: 12px; color: #6b7280;">
              © \${new Date().getFullYear()} __FOOTER_BRAND__. Todos los derechos reservados.
              &nbsp;·&nbsp;
              <a href="https://simplificacrm.es/privacidad" style="color: __PRIMARY_COLOR__; text-decoration: none;">Política de Privacidad</a>
            </td>
          </tr>
        </table>
        <p style="margin: 16px 0 0 0; font-size: 12px; color: #9ca3af; text-align: center;">
          Este email se ha enviado a \${email}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;



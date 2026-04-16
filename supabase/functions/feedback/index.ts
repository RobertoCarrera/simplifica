/**
 * Edge Function: feedback
 * Handles bug/improvement reports from the FeedbackModal widget.
 * Sends a formatted email to the system operator (Roberto).
 */
import { serve } from 'https://deno.org/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';
import { getCorsHeaders } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';

const SES_FROM = Deno.env.get('SES_FROM_EMAIL') ?? 'noreply@simplifica.es';
const SES_REGION = Deno.env.get('AWS_REGION') ?? 'eu-west-1';
const OPERATOR_EMAIL = Deno.env.get('FEEDBACK_TO_EMAIL') ?? 'roberto@simplificacrm.es';

interface FeedbackPayload {
  type: 'bug' | 'improvement';
  description: string;
  screenshot?: string;
  location: string;
  userEmail?: string; // collected silently from session
}

async function sendViaSES(
  region: string,
  awsAccessKeyId: string,
  awsSecretAccessKey: string,
  to: string[],
  subject: string,
  htmlBody: string,
  fromEmail: string,
  fromName: string,
): Promise<{ success: boolean; error?: string }> {
  const aws = new AwsClient({
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
    region,
    service: 'email',
  });

  const recipientsXml = to.map((email, idx) =>
    `<member>${email}</member>`).join('');

  const body = [
    'Action=SendEmail',
    'Version=2010-12-01',
    `Source=${fromEmail}`,
    `Destination.ToAddresses.member.1=${to[0]}`,
    `Message.Subject.Data=${encodeURIComponent(subject)}`,
    `Message.Subject.Charset=UTF-8`,
    `Message.Body.Html.Data=${encodeURIComponent(htmlBody)}`,
    `Message.Body.Html.Charset=UTF-8`,
  ].join('&');

  try {
    const response = await aws.fetch(
      `https://email.${region}.amazonaws.com`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[feedback] SES error ${response.status}: ${errorText}`);
      return { success: false, error: `SES error ${response.status}` };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[feedback] SES exception:', err.message);
    return { success: false, error: err.message };
  }
}

function buildHtmlEmail(payload: FeedbackPayload, companyName?: string): string {
  const typeLabel = payload.type === 'bug' ? '🐛 Bug' : '💡 Mejora';
  const typeColor = payload.type === 'bug' ? '#ef4444' : '#f59e0b';
  const now = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' });

  const screenshotSection = payload.screenshot
    ? `<tr><td style="padding: 12px 24px; background: #f9fafb; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280;">Captura adjunta:</p>
        <img src="${payload.screenshot}" alt="Captura" style="max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb;" />
       </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feedback - ${typeLabel}</title>
</head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; padding: 24px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%); padding: 24px 32px; text-align: center;">
              <p style="margin: 0; font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,0.7); text-transform: uppercase;">Simplifica CRM</p>
              <h1 style="margin: 8px 0 0; font-size: 22px; font-weight: 700; color: #ffffff;">${typeLabel}</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.8);">Recibido el ${now}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Type badge -->
                <tr>
                  <td style="padding-bottom: 20px;">
                    <span style="display: inline-block; background: ${typeColor}20; color: ${typeColor}; border: 1px solid ${typeColor}40; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                      ${typeLabel}
                    </span>
                    ${companyName ? `<span style="margin-left: 8px; font-size: 12px; color: #6b7280;">Empresa: ${companyName}</span>` : ''}
                  </td>
                </tr>

                <!-- Location -->
                <tr>
                  <td style="padding: 12px 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid ${typeColor}; margin-bottom: 16px;">
                    <p style="margin: 0; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Ubicación</p>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #374151; word-break: break-all;">${payload.location || 'No especificada'}</p>
                  </td>
                </tr>

                <!-- Description -->
                <tr>
                  <td style="padding: 12px 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #3b82f6; margin-bottom: 16px;">
                    <p style="margin: 0; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Descripción</p>
                    <p style="margin: 4px 0 0; font-size: 14px; color: #111827; line-height: 1.6; white-space: pre-wrap;">${payload.description}</p>
                  </td>
                </tr>

                <!-- User email (hidden/internal) -->
                ${payload.userEmail ? `
                <tr>
                  <td style="padding: 12px 16px; background: #fef3c7; border-radius: 8px; border-left: 3px solid #f59e0b;">
                    <p style="margin: 0; font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px;">Email del usuario</p>
                    <p style="margin: 4px 0 0; font-size: 14px; color: #92400e; font-weight: 600;">${payload.userEmail}</p>
                  </td>
                </tr>
                ` : ''}

                ${screenshotSection}

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f9fafb; padding: 16px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Este mensaje se ha generado automáticamente desde el widget de Feedback de Simplifica CRM.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function getAuthenticatedClient(supabaseUrl: string, apiKey: string) {
  return createClient(supabaseUrl, apiKey);
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders() });
  }

  // Rate limit check
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const rateLimit = await checkRateLimit(`feedback:${clientIp}`, 10, 60);
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: 'Demasiadas solicitudes. Espera un momento.' }), {
      status: 429,
      headers: { ...getCorsHeaders(), ...getRateLimitHeaders(rateLimit) },
    });
  }

  let payload: FeedbackPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Payload inválido' }), {
      status: 400,
      headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
    });
  }

  const { type, description, screenshot, location } = payload;
  if (!type || !description?.trim()) {
    return new Response(JSON.stringify({ error: ' type y description son requeridos' }), {
      status: 400,
      headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
    });
  }

  // Get AWS credentials from environment
  const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
  const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';

  if (!awsAccessKeyId || !awsSecretAccessKey) {
    console.error('[feedback] AWS credentials not configured');
    return new Response(JSON.stringify({ error: 'Configuración de email no disponible' }), {
      status: 503,
      headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
    });
  }

  // Try to get company name from JWT
  let companyName: string | undefined;
  try {
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const sb = createClient(supabaseUrl, serviceRoleKey);
      const { data: { user } } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
      if (user) {
        const { data: profile } = await sb
          .from('profiles')
          .select('company_id')
          .eq('user_id', user.id)
          .single();
        if (profile?.company_id) {
          const { data: company } = await sb
            .from('companies')
            .select('name')
            .eq('id', profile.company_id)
            .single();
          companyName = company?.name;
        }
      }
    }
  } catch (e) {
    console.warn('[feedback] Could not resolve company name:', e);
  }

  const subject = `[Simplifica CRM] Feedback ${type === 'bug' ? '🐛 Bug' : '💡 Mejora'}: ${description.substring(0, 60)}${description.length > 60 ? '…' : ''}`;
  const htmlBody = buildHtmlEmail(payload, companyName);

  const result = await sendViaSES(
    SES_REGION,
    awsAccessKeyId,
    awsSecretAccessKey,
    [OPERATOR_EMAIL],
    subject,
    htmlBody,
    SES_FROM,
    'Simplifica CRM Feedback',
  );

  if (!result.success) {
    console.error('[feedback] Send failed:', result.error);
    return new Response(JSON.stringify({ error: result.error || 'Error al enviar email' }), {
      status: 500,
      headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
  });
});
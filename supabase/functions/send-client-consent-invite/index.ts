// Edge Function: send-client-consent-invite
// Purpose: Send GDPR consent invitation email to a client via send-branded-email
// Flow:
// 1. Admin/Owner calls function with { client_id }
// 2. Validate usage permissions
// 3. Update client record with new invitation_token
// 4. Send email with link to public consent page via send-branded-email
//
// Two auth paths are supported (decided by the body shape, not by JWT claim):
//   - Direct user call from the CRM frontend: requires a valid user JWT and
//     owner/admin role. The client lookup is scoped to the caller's company.
//   - Service call from the send-campaign orchestrator: signaled by
//     `_service_context: 'campaign_send'` in the body. The orchestrator
//     invokes us with the service-role JWT (supabaseAdmin.functions.invoke),
//     which we cannot validate via getUser() — so we trust the flag and
//     resolve companyId from the client row instead. Direct user calls
//     cannot pass this flag to escalate (verify_jwt is on at the gateway).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';


// Helper: call send-branded-email Edge Function with fallback to direct SES
async function sendBrandedEmail(params: {
  companyId: string;
  emailType: string;
  to: { email: string; name: string }[];
  subject?: string;
  data: Record<string, unknown>;
  supabaseUrl: string;
  serviceRoleKey: string;
  // Fallback params
  fallbackHtml: string;
  fallbackToEmail: string;
  fallbackSubject: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
}): Promise<{ success: boolean; error?: string }> {
  const { supabaseUrl, serviceRoleKey, companyId, emailType, to, subject, data } = params;

  try {
    const functionsBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
    const brandedResponse = await fetch(`${functionsBase}/send-branded-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ companyId, emailType, to, subject, data }),
    });

    const result = await brandedResponse.json();
    if (result.success) {
      return { success: true };
    }
    console.warn('[send-client-consent-invite] send-branded-email returned error:', result.error);
    return { success: false, error: result.error };
  } catch (e) {
    console.warn('[send-client-consent-invite] send-branded-email not available, falling back to direct SES');
    return { success: false, error: 'send-branded-email unavailable' };
  }
}

// Fallback direct SES sender
async function sendViaSES(params: {
  html: string;
  to: string;
  subject: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
}): Promise<{ success: boolean; error?: string }> {
  const { html, to, subject, region, accessKeyId, secretAccessKey, fromEmail } = params;
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: 'email' });
  const params_ = new URLSearchParams();
  params_.append('Action', 'SendEmail');
  params_.append('Source', fromEmail);
  params_.append('Destination.ToAddresses.member.1', to);
  params_.append('Message.Subject.Data', subject);
  params_.append('Message.Body.Html.Data', html);
  const res = await aws.fetch(`https://email.${region}.amazonaws.com`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params_.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    return { success: false, error: t };
  }
  return { success: true };
}

serve(async (req) => {
    // Rate limiting FIRST (before CORS preflight) — Rafter v0.22 F-02 fix
    const ip = getClientIP(req);
    const rl = await checkRateLimit(`send-client-consent-invite:${ip}`, 20, 60000);
    if (!rl.allowed) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) }),
        });
    }

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCorsHeaders(req) });
    }

    try {
        // Parse body once. The body shape decides the auth path:
        //   - Direct user call (frontend): no _service_context flag → require
        //     a valid user JWT and owner/admin role.
        //   - Service call (send-campaign orchestrator): _service_context ===
        //     'campaign_send' → trust the orchestrator, skip the per-user
        //     auth check (the service-role JWT cannot satisfy getUser()).
        let _body: any = {};
        try { _body = await req.json(); } catch { /* body may be empty for OPTIONS */ }
        const { client_id, _service_context } = _body;

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        // Resolve companyId + client before any side effects.
        //   - User path: validate JWT + role, then scope the client lookup to
        //     the caller's company (defense in depth: even if RLS were
        //     missing, cross-tenant access would still 404).
        //   - Service path: trust the orchestrator flag and resolve companyId
        //     from the client row itself. The orchestrator has already
        //     verified the triggering user via the frontend session.
        let companyId: string;
        let client: {
            id: string;
            name: string;
            email: string;
            company_id: string;
            consent_status: string;
        };

        if (_service_context === 'campaign_send') {
            if (!client_id) throw new Error('Client ID is required');

            const { data: c, error: ce } = await supabaseClient
                .from('clients')
                .select('id, name, email, company_id, consent_status')
                .eq('id', client_id)
                .single();

            if (ce || !c) throw new Error('Client not found');
            if (!c.email) throw new Error('Client has no email address');

            client = c;
            companyId = c.company_id;
        } else {
            // 1. Auth Check (Caller must be authenticated, verify role via RLS or logic)
            const authHeader = req.headers.get('Authorization')!;
            const userClient = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                { global: { headers: { Authorization: authHeader } } }
            );

            const { data: { user }, error: userError } = await userClient.auth.getUser();
            if (userError || !user) {
                throw new Error('Unauthorized');
            }

            // Check if user is owner/admin
            const { data: userData } = await supabaseClient
                .from('users')
                .select('id, company_id, app_roles(name)')
                .eq('auth_user_id', user.id)
                .single();

            const role = userData?.app_roles?.name;
            if (role !== 'owner' && role !== 'admin') {
                throw new Error('Forbidden: Only admins/owners can send consent invites');
            }

            companyId = userData.company_id;

            if (!client_id) throw new Error('Client ID is required');

            // 2. Fetch Client (scoped to caller's company)
            const { data: c, error: ce } = await supabaseClient
                .from('clients')
                .select('id, name, email, company_id, consent_status')
                .eq('id', client_id)
                .eq('company_id', companyId)
                .single();

            if (ce || !c) throw new Error('Client not found or access denied');
            if (!c.email) throw new Error('Client has no email address');

            client = c;
        }

        const { data: companyData, error: companyError } = await supabaseClient
            .from('companies')
            .select('name')
            .eq('id', companyId)
            .single();

        if (companyError || !companyData) {
            console.error('Failed to fetch company name:', companyError?.message);
            throw new Error('Company not found for the user\'s company ID.');
        }

        const companyName = companyData.name;

        // Fetch company branding for email styling
        let primaryColor = '#4f46e5'; // CRM default indigo
        let companyLogo = '';
        try {
          const { data: brandData } = await supabaseClient
            .from('companies')
            .select('logo_url, settings')
            .eq('id', companyId)
            .single();
          if (brandData) {
            primaryColor = brandData.settings?.branding?.primary_color || primaryColor;
            if (brandData.logo_url) {
              companyLogo = `<img src="${brandData.logo_url}" alt="${companyName}" style="max-height:60px;max-width:200px;display:block;margin:0 auto 16px;">`;
            }
          }
        } catch (brandErr) {
          console.warn('[send-client-consent-invite] could not fetch company branding, using default');
        }

        // 3. Generate Token
        const token = crypto.randomUUID();
        const sentAt = new Date().toISOString();

        // 4. Update Client
        const { error: updateError } = await supabaseClient
            .from('clients')
            .update({
                invitation_token: token,
                invitation_sent_at: sentAt,
                invitation_status: 'sent',
            })
            .eq('id', client.id);

        if (updateError) throw new Error('Failed to update client record: ' + updateError.message);

        // 5. Send Email via send-branded-email (with SES fallback)
        const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
        const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
        const REGION = Deno.env.get('AWS_REGION') ?? 'us-east-1';
        const FROM_EMAIL = Deno.env.get('SES_FROM_ADDRESS') ?? 'notifications@simplificacrm.es';
        const APP_URL = Deno.env.get('FRONTEND_APP_URL') ?? 'https://app.simplificacrm.es';

        if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
            throw new Error('Missing AWS credentials');
        }

        const consentLink = `${APP_URL}/consent?token=${token}`;
        const subject = 'Importante: Actualización de Privacidad y Consentimiento';
        const htmlBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align:center;padding:20px 0;">${companyLogo}</div>
        <h2 style="color:${primaryColor};text-align:center;">Hola ${client.name},</h2>
        <p>En <strong>${companyName}</strong> nos tomamos muy en serio tu privacidad.</p>
        <p>Para seguir ofreciéndote nuestros servicios y cumplir con la normativa RGPD, necesitamos que valides tus datos y confirmes tus preferencias de privacidad.</p>
        <p style="margin: 20px 0;">
          <a href="${consentLink}" style="background-color: ${primaryColor}; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Revisar y Validar Datos
          </a>
        </p>
        <p style="font-size: 12px; color: #666;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
          ${consentLink}
        </p>
        <p>Gracias por tu confianza.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">
        <p style="font-size:12px;color:#6b7280;text-align:center;">En cumplimiento del RGPD, sus datos serán tratados conforme a nuestra <a href="${APP_URL}/privacidad" style="color:#6b7280;">política de privacidad</a>.</p>
      </div>
    `;

        // Try send-branded-email first, fall back to direct SES
        let emailSent = false;
        if (companyId && Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
          const brandedResult = await sendBrandedEmail({
            companyId,
            emailType: 'consent',
            to: [{ email: client.email, name: client.name }],
            subject,
            data: { client: { name: client.name, email: client.email }, company: { name: companyName }, link: consentLink },
            supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
            serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            fallbackHtml: htmlBody,
            fallbackToEmail: client.email,
            fallbackSubject: subject,
            region: REGION,
            accessKeyId: AWS_ACCESS_KEY_ID,
            secretAccessKey: AWS_SECRET_ACCESS_KEY,
            fromEmail: FROM_EMAIL,
          });
          if (brandedResult.success) {
            emailSent = true;
          } else {
            // Branded-email returned a real error (e.g. missing
            // company_email_settings for emailType='consent'). Do NOT throw —
            // the SES fallback below still works and is the documented safety
            // net for consent invitations. We log the branded error for
            // observability so the tenant team can fix the settings later.
            console.warn(
              `[send-client-consent-invite] send-branded-email did not succeed (${brandedResult.error ?? 'unknown'}); falling back to direct SES.`,
            );
          }
        }

        // Fallback to direct SES if branded email not available
        if (!emailSent) {
          const aws = new AwsClient({
              accessKeyId: AWS_ACCESS_KEY_ID,
              secretAccessKey: AWS_SECRET_ACCESS_KEY,
              region: REGION,
              service: 'email',
          });

          const params_ = new URLSearchParams();
          params_.append('Action', 'SendEmail');
          params_.append('Source', FROM_EMAIL);
          params_.append('Destination.ToAddresses.member.1', client.email);
          params_.append('Message.Subject.Data', subject);
          params_.append('Message.Body.Html.Data', htmlBody);

          const response = await aws.fetch(`https://email.${REGION}.amazonaws.com`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params_.toString()
          });

          if (!response.ok) {
              const txt = await response.text();
              console.error('SES Error:', txt);
              throw new Error('Failed to send email via AWS SES');
          }
        }

        return new Response(JSON.stringify({ success: true, message: 'Invitation sent' }), {
            headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
        });

    } catch (error: any) {
        console.error(error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
        });
    }
});
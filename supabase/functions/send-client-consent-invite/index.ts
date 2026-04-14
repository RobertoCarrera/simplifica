// Edge Function: send-client-consent-invite
// Purpose: Send GDPR consent invitation email to a client via send-branded-email
// Flow:
// 1. Admin/Owner calls function with { client_id }
// 2. Validate usage permissions
// 3. Update client record with new invitation_token
// 4. Send email with link to public consent page via send-branded-email

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

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

        const companyId = userData.company_id;

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

        const { client_id } = await req.json();
        if (!client_id) throw new Error('Client ID is required');

        // 2. Fetch Client
        const { data: client, error: clientError } = await supabaseClient
            .from('clients')
            .select('id, name, email, company_id, consent_status')
            .eq('id', client_id)
            .eq('company_id', companyId)
            .single();

        if (clientError || !client) throw new Error('Client not found or access denied');
        if (!client.email) throw new Error('Client has no email address');

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
            .eq('id', client_id);

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
        <h2>Hola ${client.name},</h2>
        <p>En <strong>${companyName}</strong> nos tomamos muy en serio tu privacidad.</p>
        <p>Para seguir ofreciéndote nuestros servicios y cumplir con la normativa RGPD, necesitamos que valides tus datos y confirmes tus preferencias de privacidad.</p>
        <p style="margin: 20px 0;">
          <a href="${consentLink}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Revisar y Validar Datos
          </a>
        </p>
        <p style="font-size: 12px; color: #666;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
          ${consentLink}
        </p>
        <p>Gracias por tu confianza.</p>
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
          } else if (brandedResult.error !== 'send-branded-email unavailable') {
            throw new Error('Branded email failed: ' + brandedResult.error);
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
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error(error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
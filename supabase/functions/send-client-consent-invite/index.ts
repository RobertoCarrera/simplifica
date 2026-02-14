// Edge Function: send-client-consent-invite
// Purpose: Send GDPR consent invitation email to a client
// Flow:
// 1. Admin/Owner calls function with { client_id }
// 2. Validate usage permissions
// 3. Update client record with new invitation_token
// 4. Send email with link to public consent page

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Service role to update client
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        // 1. Auth Check (Caller must be authenticated, we'll verify role via RLS or logic if needed, 
        // but here we trust the service role key usage if we were calling internally, 
        // wait, we are using the Authorization header to create client? 
        // No, we used SERVICE_ROLE_KEY above. We should verify the *caller* is an admin/owner.)

        // Create a regular client to check the user's role
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
        // We can query company_members or public.users (legacy role check or new app_roles check)
        // Let's use the new app_roles check logic or just assume if they can trigger this UI they are authorized?
        // Safer to check. 
        // Simplified check: Query user_company_context or similar view? 
        // Let's just trust the DB RLS if we were doing a DB update, but here we use Service Role.
        // So we MUST check.
        const { data: userData } = await supabaseClient
            .from('users')
            .select('id, company_id, app_roles(name)')
            .eq('auth_user_id', user.id)
            .single();

        const role = userData?.app_roles?.name;
        if (role !== 'owner' && role !== 'admin') {
            throw new Error('Forbidden: Only admins/owners can send consent invites');
        }

        const { client_id } = await req.json();
        if (!client_id) throw new Error('Client ID is required');

        // 2. Fetch Client
        const { data: client, error: clientError } = await supabaseClient
            .from('clients')
            .select('id, name, email, company_id, consent_status')
            .eq('id', client_id)
            .eq('company_id', userData.company_id) // Ensure client belongs to user's company
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
                // We do NOT change consent_status yet, only when they accept
            })
            .eq('id', client_id);

        if (updateError) throw new Error('Failed to update client record: ' + updateError.message);

        // 5. Send Email (AWS SES)
        const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
        const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
        const REGION = Deno.env.get('AWS_REGION') ?? 'us-east-1';
        const FROM_EMAIL = Deno.env.get('SES_FROM_ADDRESS') ?? 'notifications@simplificacrm.es';
        const APP_URL = Deno.env.get('FRONTEND_APP_URL') ?? 'https://app.simplificacrm.es';

        if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
            throw new Error('Missing AWS credentials');
        }

        const aws = new AwsClient({
            accessKeyId: AWS_ACCESS_KEY_ID,
            secretAccessKey: AWS_SECRET_ACCESS_KEY,
            region: REGION,
            service: 'email',
        });

        const consentLink = `${APP_URL}/consent/${token}`; // Route: /consent/:token
        // Or query param: `${APP_URL}/consent?token=${token}`. 
        // Plan said: /consent?token=... but /consent/:token is cleaner if router supports it.
        // Let's use query param for safety with existing router:
        const link = `${APP_URL}/consent?token=${token}`;

        const subject = 'Importante: Actualización de Privacidad y Consentimiento';
        const htmlBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hola ${client.name},</h2>
        <p>En <strong>${userData.company_id /* TODO: Fetch Company Name */}</strong> nos tomamos muy en serio tu privacidad.</p>
        <p>Para seguir ofreciéndote nuestros servicios y cumplir con la normativa RGPD, necesitamos que valides tus datos y confirmes tus preferencias de privacidad.</p>
        <p style="margin: 20px 0;">
          <a href="${link}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Revisar y Validar Datos
          </a>
        </p>
        <p style="font-size: 12px; color: #666;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
          ${link}
        </p>
        <p>Gracias por tu confianza.</p>
      </div>
    `;

        // Construct form data for SES (SendEmail)
        // Using simple SendEmail action (not v2) as in send-email example maybe?
        // send-email used: params.append('Action', 'SendEmail'); ... 
        // invoices-email used: v2 JSON API.
        // Let's match send-email logic since we imported AwsClient which is good for signed fetch.
        // But AwsClient doesn't abstract the body construction for v2.
        // Let's stick to the send-email example code pattern (SES v1 Query API) as it looked robust in that file.

        const params = new URLSearchParams();
        params.append('Action', 'SendEmail');
        params.append('Source', FROM_EMAIL);
        params.append('Destination.ToAddresses.member.1', client.email);
        params.append('Message.Subject.Data', subject);
        params.append('Message.Body.Html.Data', htmlBody);

        const response = await aws.fetch(`https://email.${REGION}.amazonaws.com`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (!response.ok) {
            const txt = await response.text();
            console.error('SES Error:', txt);
            throw new Error('Failed to send email via AWS SES');
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

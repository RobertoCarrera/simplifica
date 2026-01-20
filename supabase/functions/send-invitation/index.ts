
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
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        const {
            invitationId,
            toEmail,
            companyName,
            role,
            message,
            invitedBy // Name of inviter
        } = await req.json();

        if (!toEmail || !companyName) {
            throw new Error('Missing required fields');
        }

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

        // 2. Prepare Email Content
        const subject = `Invitación a ${companyName} - Simplifica`;

        let textBody = `Hola,\n\n${invitedBy || 'Un administrador'} te ha invitado a unirte a "${companyName}" en Simplifica.`;
        if (message) {
            textBody += `\n\nMensaje: "${message}"`;
        }
        textBody += `\n\nPor favor, inicia sesión en la plataforma para aceptar la invitación.`;

        const htmlBody = `
            <div style="font-family: sans-serif; padding: 20px;">
                <h2>Invitación a ${companyName}</h2>
                <p>Hola,</p>
                <p><strong>${invitedBy || 'Un administrador'}</strong> te ha invitado a unirte a "<strong>${companyName}</strong>" en Simplifica.</p>
                ${message ? `<blockquote style="background: #f9f9f9; padding: 10px; border-left: 4px solid #ccc;">${message}</blockquote>` : ''}
                <p>Por favor, inicia sesión en la plataforma para aceptar la invitación.</p>
                <a href="${Deno.env.get('APP_URL') || 'https://app.simplificacrm.es'}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Ir a la App</a>
            </div>
        `;

        // 3. Send via SES
        const params = new URLSearchParams();
        params.append('Action', 'SendEmail');
        // Use a generic system sender if possible, or verify a single identity like 'noreply@simplificacrm.es'
        // For now, using a known verified sender or the one from env if set.
        const fromEmail = Deno.env.get('SYSTEM_SENDER_EMAIL') || 'no-reply@simplificacrm.es';
        params.append('Source', `Simplifica <${fromEmail}>`);

        params.append('Destination.ToAddresses.member.1', toEmail);
        params.append('Message.Subject.Data', subject);
        params.append('Message.Body.Text.Data', textBody);
        params.append('Message.Body.Html.Data', htmlBody);

        const response = await aws.fetch(`https://email.${REGION}.amazonaws.com`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('AWS SES Error:', errorText);
            throw new Error(`AWS SES Error: ${response.status} ${errorText}`);
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

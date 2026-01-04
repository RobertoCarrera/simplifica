
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
            accountId,
            fromName,
            fromEmail,
            to, // array of {email, name}
            subject,
            body, // text body
            html_body // optional html
        } = await req.json();

        if (!accountId || !fromEmail || !to || !subject) {
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

        // 2. Prepare SES params
        // aws4fetch doesn't have a high level SES helper, we use raw API.
        // Action=SendEmail

        const toAddresses = to.map((t: any) => t.email);

        // Construct form data for SES
        const params = new URLSearchParams();
        params.append('Action', 'SendEmail');
        params.append('Source', fromName ? `"${fromName}" <${fromEmail}>` : fromEmail);

        toAddresses.forEach((email: string, index: number) => {
            params.append(`Destination.ToAddresses.member.${index + 1}`, email);
        });

        params.append('Message.Subject.Data', subject);
        params.append('Message.Body.Text.Data', body);
        if (html_body) {
            params.append('Message.Body.Html.Data', html_body);
        }

        // 3. Send to AWS
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

        const xmlResponse = await response.text();
        // Parse MessageId from XML if needed, but simple success check is usually enough

        // 4. Save to Sent Folder
        // a. Find 'Sent' folder for this account
        const { data: folderData, error: folderError } = await supabaseClient
            .from('mail_folders')
            .select('id')
            .eq('account_id', accountId)
            .eq('system_role', 'sent')
            .single();

        let folderId = null;
        if (folderData) {
            folderId = folderData.id;
        } else {
            // Fallback: try finding by name 'Sent'
            const { data: folderByName } = await supabaseClient
                .from('mail_folders')
                .select('id')
                .eq('account_id', accountId)
                .eq('name', 'Sent')
                .single();
            if (folderByName) folderId = folderByName.id;
        }

        // b. Insert message
        const { data: msgData, error: msgError } = await supabaseClient
            .from('mail_messages')
            .insert({
                account_id: accountId,
                folder_id: folderId,
                from: { name: fromName, email: fromEmail },
                to: to,
                subject: subject,
                body_text: body,
                body_html: html_body || body,
                snippet: body.substring(0, 100),
                is_read: true,
                received_at: new Date().toISOString()
            })
            .select()
            .single();

        if (msgError) {
            console.error('Error saving to Sent:', msgError);
            // We don't fail the request because email was sent, but warn.
        }

        return new Response(JSON.stringify({ success: true, messageId: 'sent', dbMessage: msgData }), {
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

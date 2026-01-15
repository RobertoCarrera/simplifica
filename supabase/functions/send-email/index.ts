
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: Boundary generator
const generateBoundary = () => `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2)}`;

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
            html_body, // optional html
            attachments, // optional array of { filename, content (base64), contentType }
            trackingId, // optional tracking ID for pixel
            threadId // optional thread ID
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

        // 2. Construct MIME Message
        const boundary = generateBoundary();
        const mixedBoundary = `mixed_${boundary}`;
        const altBoundary = `alt_${boundary}`;

        let rawMessage = '';

        // Headers
        rawMessage += `From: "${fromName}" <${fromEmail}>\n`;
        const toList = to.map((t: any) => t.name ? `"${t.name}" <${t.email}>` : t.email).join(', ');
        rawMessage += `To: ${toList}\n`;
        rawMessage += `Subject: ${subject}\n`;
        rawMessage += `MIME-Version: 1.0\n`;
        rawMessage += `Content-Type: multipart/mixed; boundary="${mixedBoundary}"\n\n`;

        // -- MIXED BOUNDARY START
        rawMessage += `--${mixedBoundary}\n`;

        // Alternative part (Text + HTML)
        rawMessage += `Content-Type: multipart/alternative; boundary="${altBoundary}"\n\n`;

        // Text Body
        rawMessage += `--${altBoundary}\n`;
        rawMessage += `Content-Type: text/plain; charset=UTF-8\n`;
        rawMessage += `Content-Transfer-Encoding: 7bit\n\n`;
        rawMessage += `${body}\n\n`;

        // HTML Body
        if (html_body || trackingId) {
            let finalHtml = html_body || body.replace(/\n/g, '<br>');

            // Inject Tracking Pixel
            if (trackingId) {
                const pixelUrl = `${Deno.env.get('SUPABASE_FUNCTIONS_URL')}/track-email?id=${trackingId}`;
                finalHtml += `<img src="${pixelUrl}" alt="" width="1" height="1" style="display:none;" />`;
            }

            rawMessage += `--${altBoundary}\n`;
            rawMessage += `Content-Type: text/html; charset=UTF-8\n`;
            rawMessage += `Content-Transfer-Encoding: 7bit\n\n`;
            rawMessage += `${finalHtml}\n\n`;
        }

        // End Alternative
        rawMessage += `--${altBoundary}--\n\n`;

        // Attachments
        if (attachments && Array.isArray(attachments)) {
            for (const att of attachments) {
                if (att.content && att.filename) {
                    rawMessage += `--${mixedBoundary}\n`;
                    rawMessage += `Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"\n`;
                    rawMessage += `Content-Transfer-Encoding: base64\n`;
                    rawMessage += `Content-Disposition: attachment; filename="${att.filename}"\n\n`;
                    rawMessage += `${att.content}\n\n`;
                }
            }
        }

        // End Mixed
        rawMessage += `--${mixedBoundary}--\n`;

        // 3. Prepare SES params (SendRawEmail)
        const params = new URLSearchParams();
        params.append('Action', 'SendRawEmail');
        params.append('RawMessage.Data', btoa(rawMessage));
        // Source is required even for Raw
        params.append('Source', fromName ? `"${fromName}" <${fromEmail}>` : fromEmail);
        to.forEach((t: any, i: number) => {
            params.append(`Destinations.member.${i + 1}`, t.email);
        });

        // 4. Send to AWS
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

        // 5. Save to Sent Folder (Simplified for speed)
        // Find Sent folder... (omitted full retry logic for brevity, assuming standard setup)
        const { data: folder } = await supabaseClient.from('mail_folders').select('id').eq('account_id', accountId).eq('system_role', 'sent').single();

        if (folder) {
            // Ensure Thread ID exists
            let finalThreadId = threadId;

            if (!finalThreadId) {
                // Create a new Thread
                const { data: threadData, error: threadError } = await supabaseClient
                    .from('mail_threads')
                    .insert({
                        account_id: accountId,
                        subject: subject,
                        snippet: body.substring(0, 100),
                        last_message_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (!threadError && threadData) {
                    finalThreadId = threadData.id;
                } else {
                    console.error('Error creating thread:', threadError);
                    // Fallback: Proceed without thread_id (will be orphaned, but message saved)
                    // Or throw? Better to save message.
                }
            } else {
                // Update existing thread's last_message_at
                await supabaseClient
                    .from('mail_threads')
                    .update({
                        last_message_at: new Date().toISOString(),
                        snippet: body.substring(0, 100)
                    })
                    .eq('id', finalThreadId);
            }

            const messageData: any = {
                account_id: accountId,
                folder_id: folder.id,
                from: { name: fromName, email: fromEmail },
                to: to,
                subject: subject,
                body_text: body,
                body_html: html_body || body,
                snippet: body.substring(0, 100),
                is_read: true,
                received_at: new Date().toISOString(),
                metadata: {
                    tracking_id: trackingId,
                    has_attachments: (attachments && attachments.length > 0)
                },
                thread_id: finalThreadId
            };

            const { data: msgMsg } = await supabaseClient.from('mail_messages').insert(messageData).select().single();

            // Save attachments to mail_attachments table
            if (msgMsg && attachments && Array.isArray(attachments)) {
                const attachmentRecords = attachments
                    .filter((att: any) => att.filename && att.storage_path)
                    .map((att: any) => ({
                        message_id: msgMsg.id,
                        filename: att.filename,
                        size: att.size || 0,
                        content_type: att.contentType,
                        storage_path: att.storage_path
                    }));

                if (attachmentRecords.length > 0) {
                    const { error: attError } = await supabaseClient.from('mail_attachments').insert(attachmentRecords);
                    if (attError) {
                        console.error('Error saving attachments:', attError);
                    }
                }
            }

            return new Response(JSON.stringify({ success: true, trackingId }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    } catch (error: any) {
        console.error(error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

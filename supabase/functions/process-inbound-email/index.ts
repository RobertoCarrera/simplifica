
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to decode Base64
function decodeBase64(str: string): Uint8Array {
    const binaryString = atob(str);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const {
            to,
            from,
            subject,
            body,
            html_body,
            messageId,
            inReplyTo,
            attachments // Array of { filename, content (base64), contentType, size }
        } = await req.json();

        if (!to || !from || !subject) {
            throw new Error('Missing required fields: to, from, subject');
        }

        const targetEmail = extractEmail(to);
        console.log(`Processing inbound for: ${targetEmail}`);

        // 1. Find Account
        const { data: account, error: accountError } = await supabaseClient
            .from('mail_accounts')
            .select('id, user_id')
            .eq('email', targetEmail)
            .single();

        if (accountError || !account) {
            throw new Error(`Account not found for ${targetEmail}`);
        }

        // 2. Find Inbox
        const { data: inbox } = await supabaseClient
            .from('mail_folders')
            .select('id')
            .eq('account_id', account.id)
            .eq('system_role', 'inbox')
            .single();

        if (!inbox) throw new Error('Inbox not found');

        // 3. Threading
        let threadId = null;
        if (inReplyTo) {
            const { data: originalMsg } = await supabaseClient
                .from('mail_messages')
                .select('thread_id')
                .eq('metadata->>messageId', inReplyTo)
                .single();
            if (originalMsg) threadId = originalMsg.thread_id;
        }

        if (!threadId) {
            const { data: newThread } = await supabaseClient
                .from('mail_threads')
                .insert({
                    account_id: account.id,
                    subject: subject,
                    snippet: body.substring(0, 100)
                })
                .select()
                .single();
            if (newThread) threadId = newThread.id;
        } else {
            await supabaseClient
                .from('mail_threads')
                .update({ last_message_at: new Date().toISOString(), snippet: body.substring(0, 100) })
                .eq('id', threadId);
        }

        // 4. Insert Message
        const { data: newMessage, error: insertError } = await supabaseClient
            .from('mail_messages')
            .insert({
                account_id: account.id,
                folder_id: inbox.id,
                thread_id: threadId,
                from: typeof from === 'string' ? { email: from, name: '' } : from,
                to: [{ email: targetEmail, name: '' }],
                subject: subject,
                body_text: body,
                body_html: html_body || body,
                snippet: body.substring(0, 100),
                is_read: false,
                metadata: { messageId, inReplyTo, has_attachments: (attachments && attachments.length > 0) }
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 5. Handle Attachments
        if (attachments && Array.isArray(attachments)) {
            const uploadPromises = attachments.map(async (att: any) => {
                if (!att.content || !att.filename) return;

                const fileContent = decodeBase64(att.content);
                const year = new Date().getFullYear();
                const month = new Date().getMonth() + 1;
                // Path: accountId/year/month/messageId/filename
                const storagePath = `${account.id}/${year}/${month}/${newMessage.id}/${att.filename}`;

                // Upload to Storage
                const { error: uploadError } = await supabaseClient
                    .storage
                    .from('mail-attachments')
                    .upload(storagePath, fileContent, {
                        contentType: att.contentType || 'application/octet-stream',
                        upsert: true
                    });

                if (uploadError) {
                    console.error('Upload error:', uploadError);
                    return;
                }

                // Insert into DB
                await supabaseClient
                    .from('mail_attachments')
                    .insert({
                        message_id: newMessage.id,
                        filename: att.filename,
                        size: att.size || fileContent.byteLength,
                        content_type: att.contentType,
                        storage_path: storagePath
                    });
            });

            await Promise.all(uploadPromises);
        }

        return new Response(JSON.stringify({ success: true, id: newMessage.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Inbound Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

function extractEmail(input: string): string {
    const match = input.match(/<(.+)>/);
    if (match) return match[1];
    return input.trim();
}

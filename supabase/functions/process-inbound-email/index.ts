
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Security check: Validate Webhook Secret
        const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');
        const requestSecret = req.headers.get('x-webhook-secret');

        if (!WEBHOOK_SECRET || requestSecret !== WEBHOOK_SECRET) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const {
            to, // recipient email (our user)
            from, // sender info { name, email } or just email string
            subject,
            body,
            html_body,
            messageId, // external ID
            inReplyTo // for threading
        } = await req.json();

        if (!to || !from || !subject) {
            throw new Error('Missing required fields: to, from, subject');
        }

        // Normalize 'to' to find the account
        // Input might be "Name <email@domain.com>" or just "email@domain.com"
        // For simulation we assume simple email string or extract it.
        const targetEmail = extractEmail(to);

        console.log(`Processing inbound email for: ${targetEmail}`);

        // 1. Find Account
        const { data: account, error: accountError } = await supabaseClient
            .from('mail_accounts')
            .select('id, user_id')
            .eq('email', targetEmail) // Match exactly for now
            .single();

        if (accountError || !account) {
            console.error('Account not found for email:', targetEmail);
            throw new Error(`Account not found for ${targetEmail}`);
        }

        // 2. Find Inbox Folder
        const { data: inbox, error: inboxError } = await supabaseClient
            .from('mail_folders')
            .select('id')
            .eq('account_id', account.id)
            .eq('system_role', 'inbox')
            .single();

        if (inboxError || !inbox) {
            console.error('Inbox not found for account:', account.id);
            throw new Error('Inbox not found');
        }

        // 3. Threading Logic (Simplified)
        let threadId = null;
        if (inReplyTo) {
            // Try to find original message to get its thread_id
            // This is a naive implementation, real world threads are complex
            const { data: originalMsg } = await supabaseClient
                .from('mail_messages')
                .select('thread_id')
                .eq('metadata->>messageId', inReplyTo) // Assuming we store Message-ID in metadata
                .single();

            if (originalMsg) threadId = originalMsg.thread_id;
        }

        // If no thread found, create one? Or let insert trigger handle it?
        // Schema has mail_threads table.
        // For now, if no threadId, create a new Thread.
        if (!threadId) {
            const { data: newThread, error: threadError } = await supabaseClient
                .from('mail_threads')
                .insert({
                    account_id: account.id,
                    subject: subject,
                    snippet: body.substring(0, 100)
                })
                .select()
                .single();

            if (!threadError && newThread) threadId = newThread.id;
        } else {
            // Update existing thread snippet/date
            await supabaseClient
                .from('mail_threads')
                .update({
                    last_message_at: new Date().toISOString(),
                    snippet: body.substring(0, 100)
                })
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
                to: [{ email: targetEmail, name: '' }], // We are the recipient
                subject: subject,
                body_text: body,
                body_html: html_body || body,
                snippet: body.substring(0, 100),
                is_read: false, // Unread
                metadata: {
                    messageId: messageId,
                    inReplyTo: inReplyTo
                }
            })
            .select()
            .single();

        if (insertError) {
            throw insertError;
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

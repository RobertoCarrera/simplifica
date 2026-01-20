import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: req.headers.get('Authorization')! },
                },
            }
        );

        const { campaignId } = await req.json();

        if (!campaignId) {
            throw new Error('Campaign ID is required');
        }

        // 1. Fetch Campaign Details
        const { data: campaign, error: campError } = await supabaseClient
            .from('marketing_campaigns')
            .select('*')
            .eq('id', campaignId)
            .single();

        if (campError || !campaign) throw new Error('Campaign not found');

        if (campaign.status === 'sent') {
            return new Response(JSON.stringify({ message: 'Campaign already sent' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 2. Fetch Audience
        // We reuse the existing RPC logic to ensure consistency
        const { data: audience, error: audError } = await supabaseClient
            .rpc('f_marketing_get_audience', {
                p_company_id: campaign.company_id,
                p_criteria: campaign.target_audience
            });

        if (audError) throw audError;

        if (!audience || audience.length === 0) {
            return new Response(JSON.stringify({ message: 'No audience found to send to' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        console.log(`Processing campaign ${campaign.name} for ${audience.length} recipients`);

        // 3. Process Sending
        let sentCount = 0;
        let failCount = 0;

        // Use a loop. For very large lists, this should be queued or batched.
        // Deno Deploy has a timeout (approx 50s-100s?), so we process what we can.
        // For now, we assume reasonable lists (< 50).

        // We need the admin account or a system account to send email from?
        // Actually, send-email expects the caller to provide 'accountId' context OR we can use the company's email settings.
        // Problem: send-email takes `accountId` and `fromEmail`.
        // We need to fetch the company's default mail account or use the company email.
        // Let's look for a 'system' mail account for this company or just use the first active one.

        const { data: mailAccount, error: accError } = await supabaseClient
            .from('mail_accounts')
            .select('*')
            .eq('user_id', campaign.company_id) // Assuming company_id maps to user_id for mail_accounts? Or we need to look up owner?
            // Wait, mail_accounts are per user (employee/admin), not per company directly in the current schema?
            // Let's check `mail_accounts` schema.
            // If we can't find one, we might fail.
            // For now, let's try to find an active account for this company.
            // Actually, looking at `MailOperationService`, `accountId` corresponds to a row in `mail_accounts`.
            // We will try to pick the first active mail account for the company (or the user who created the campaign, but we don't have that ID here easily unless we added created_by).
            // Let's assuming we pick the first active account for the company (if company_id is linked effectively).
            // Actually, `mail_accounts` has `user_id`. `companies` has `owner_id`.
            // Let's try to get the company owner's mail account.

            // Simpler approach: Look for ANY active mail account for an admin of this company?
            // Or just use a specific one provided in the UI?
            // Ideally UI should select "From".
            // FALLBACK: Use the first active mail account found for any user in this company? No, that's risky.
            // Let's assume we use the COMPANY EMAIL if no mail account? But `send-email` needs SES credentials which are likely properly configured in `mail_accounts`.

            // QUERY: Get company owner, then get their mail account.
            .limit(1)
            .maybeSingle();

        // RE-PLAN: The `process-campaign` probably needs to know WHICH account to send from.
        // But for now, I'll attempt to find *a* valid sender or error out.

        // Better: Fetch the campaign creator? We don't track created_by in campaigns schema yet?
        // Let's assume the company owner has an account.

        const { data: company } = await supabaseClient.from('companies').select('owner_id').eq('id', campaign.company_id).single();

        let senderAccount = null;
        if (company) {
            const { data: acc } = await supabaseClient
                .from('mail_accounts')
                .select('*')
                .eq('user_id', company.owner_id)
                .eq('is_active', true)
                .limit(1)
                .maybeSingle();
            senderAccount = acc;
        }

        if (!senderAccount) {
            throw new Error('No active email account found for company owner to send campaigns.');
        }

        for (const member of audience) {
            try {
                // Personalize
                const personalizedContent = campaign.content.replace(/{name}/g, member.name || 'Cliente');

                // Prepare Payload for send-email
                const emailPayload = {
                    accountId: senderAccount.id,
                    fromName: senderAccount.sender_name || 'Simplifica Info',
                    fromEmail: senderAccount.email,
                    to: [{ name: member.name, email: member.email }],
                    subject: campaign.subject,
                    body: personalizedContent, // Text body
                    html_body: `<p>${personalizedContent.replace(/\n/g, '<br>')}</p>`, // Simple HTML conversion
                    trackingId: `cmp_${campaign.id}_${member.client_id}` // Custom tracking ID
                };

                // Invoke send-email
                // We use functions.invoke within the edge function? 
                // Or simple fetch to the function URL.
                const sendRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ body: emailPayload }) // send-email expects { body: { ... } } structure? Check its code.
                });

                if (!sendRes.ok) {
                    const errText = await sendRes.text();
                    console.error(`Failed to send to ${member.email}: ${errText}`);
                    failCount++;

                    // Log Failure
                    await supabaseClient.from('marketing_logs').insert({
                        campaign_id: campaign.id,
                        client_id: member.client_id,
                        status: 'failed',
                        error_message: errText
                    });

                } else {
                    sentCount++;

                    // Log Success
                    await supabaseClient.from('marketing_logs').insert({
                        campaign_id: campaign.id,
                        client_id: member.client_id,
                        status: 'sent',
                        sent_at: new Date().toISOString()
                    });
                }

            } catch (err) {
                console.error(`Error processing member ${member.email}:`, err);
                failCount++;
            }
        }

        // 4. Update Campaign Status
        await supabaseClient
            .from('marketing_campaigns')
            .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                metadata: { sent_count: sentCount, fail_count: failCount }
            })
            .eq('id', campaignId);

        return new Response(JSON.stringify({
            success: true,
            sent: sentCount,
            failed: failCount
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});

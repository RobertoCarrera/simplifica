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

    // ── v2 auth (internal cron only): apikey header | legacy Bearer service_role ──
    // No user-JWT branch — this EF is only called by pg_cron `marketing-automation-daily`.
    // The inner createClient below still passes the incoming Authorization through so
    // downstream queries run as the original caller (cron sends apikey-only → header will
    // be null; the SERVICE_ROLE_KEY passed to createClient gives admin access regardless).
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const apikeyHdr = req.headers.get('apikey') ?? '';
    const bearerTok = (req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i) || [])[1] ?? '';
    const VALID_KEYS = new Set<string>([SERVICE_ROLE_KEY]);
    for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')))      if (typeof v === 'string') VALID_KEYS.add(v);
    for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))) if (typeof v === 'string') VALID_KEYS.add(v);
    const authed = (apikeyHdr && VALID_KEYS.has(apikeyHdr)) || bearerTok === SERVICE_ROLE_KEY;
    if (!authed) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        // Inner client uses SERVICE_ROLE_KEY for admin access. The incoming
        // Authorization header is passed through for "act as caller" semantics
        // when the caller is a user JWT — but for cron calls (apikey-only),
        // it's null, so we fall back to Bearer service_role to avoid
        // `Authorization: null` (which would break downstream RLS-context calls).
        const callerAuth = req.headers.get('Authorization')?.startsWith('Bearer ')
            ? req.headers.get('Authorization')!
            : `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`;
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: callerAuth },
                },
            }
        );

        console.log("Staring Automation Check...");

        // 1. Fetch Active Automated Campaigns
        const { data: campaigns, error: campError } = await supabaseClient
            .from('marketing_campaigns')
            .select('*')
            .eq('is_active', true)
            .neq('trigger_type', 'manual');

        if (campError) throw campError;

        let totalSent = 0;
        let logs = [];

        for (const campaign of campaigns) {
            console.log(`Processing Campaign: ${campaign.name} (${campaign.trigger_type})`);

            // 2. Get Audience for this Trigger
            const { data: audience, error: audError } = await supabaseClient
                .rpc('f_marketing_get_automation_audience', {
                    p_company_id: campaign.company_id,
                    p_trigger_type: campaign.trigger_type,
                    p_config: campaign.config
                });

            if (audError) {
                console.error(`Error getting audience for ${campaign.name}:`, audError);
                continue;
            }

            if (!audience || audience.length === 0) continue;

            // 3. Filter already sent (Dedup)
            // Implementation: Check marketing_logs for this campaign_id and client_id
            // Limit check to "recent" (e.g., last 11 months for birthdays, ever for inactivity?)
            // For MVP: Simple check "Has ever received this campaign?" 
            // Better for Birthday: "Has received in last 300 days?"

            // To be efficient, we might want to fetch all logs for this campaign first?
            // Or just check one by one (ok for small batches).

            for (const client of audience) {
                // Check duplicate
                // For 'inactivity', send ONLY ONCE ever.
                // For 'birthday', send once per year.

                let shouldSend = true;

                if (campaign.trigger_type === 'inactivity') {
                    const { count } = await supabaseClient
                        .from('marketing_logs')
                        .select('id', { count: 'exact', head: true })
                        .eq('campaign_id', campaign.id)
                        .eq('client_id', client.client_id);

                    if (count && count > 0) shouldSend = false;
                }
                else if (campaign.trigger_type === 'birthday') {
                    // Check if sent in the last year
                    const oneYearAgo = new Date();
                    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

                    const { count } = await supabaseClient
                        .from('marketing_logs')
                        .select('id', { count: 'exact', head: true })
                        .eq('campaign_id', campaign.id)
                        .eq('client_id', client.client_id)
                        .gt('sent_at', oneYearAgo.toISOString());

                    if (count && count > 0) shouldSend = false;
                }

                if (!shouldSend) continue;

                // 4. Send Email (Invoke send-email via fetch or find sender)
                // We need the SENDER account. 
                // We reuse logic: Get Company Owner -> Get Active Mail Account.

                // OPTIMIZATION: Fetch sender account once per campaign (outside loop)
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
                    console.warn(`No sender account for company ${campaign.company_id}`);
                    break; // Skip whole campaign if no sender
                }

                try {
                    const personalizedContent = campaign.content.replace(/{name}/g, client.name || 'Cliente');

                    const emailPayload = {
                        accountId: senderAccount.id,
                        fromName: senderAccount.sender_name || 'Simplifica',
                        fromEmail: senderAccount.email,
                        to: [{ name: client.name, email: client.email }],
                        subject: campaign.subject || "Notificación",
                        body: personalizedContent,
                        html_body: `<p>${personalizedContent.replace(/\n/g, '<br>')}</p>`,
                        trackingId: `auto_${campaign.id}_${client.client_id}`
                    };

                    const sendRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(emailPayload)
                    });

                    if (sendRes.ok) {
                        // Log Success
                        await supabaseClient.from('marketing_logs').insert({
                            campaign_id: campaign.id,
                            client_id: client.client_id,
                            status: 'sent',
                            channel: 'email'
                        });
                        totalSent++;
                        logs.push(`Sent to ${client.email}`);
                    } else {
                        console.error(`Failed to send to ${client.email}`);
                    }

                } catch (e) {
                    console.error("Error sending:", e);
                }
            }
        }

        return new Response(JSON.stringify({
            success: true,
            processed: totalSent,
            logs
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { getClientIP, withSecurityHeaders, isValidUUID } from '../_shared/security.ts';

/**
 * Strip HTML tags from a string to produce plain text fallback.
 * Used when sending emails that require both plain text and HTML versions.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface Campaign {
  id: string;
  company_id: string;
  name: string;
  type: string;
  subject: string | null;
  content: string;
  target_audience: { client_ids: string[] } | null;
  config?: { is_onboarding_email?: boolean } | null;
}

interface Client {
  id: string;
  email: string;
  name: string;
  surname: string;
  marketing_consent?: boolean;
  consent_migration_sent_at?: string | null;
}

serve(async (req: Request) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  try {
    const { campaignId } = await req.json();
    if (!campaignId || !isValidUUID(campaignId)) {
      return new Response(JSON.stringify({ error: 'campaignId (UUID) required' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client (service role for admin access)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Fetch campaign
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('marketing_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), {
        status: 404,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const c = campaign as Campaign;
    const clientIds = c.target_audience?.client_ids || [];

    if (clientIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No audience selected' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch target clients
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id, email, name, surname, marketing_consent, consent_migration_sent_at')
      .in('id', clientIds)
      .eq('is_active', true);

    if (clientsError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch clients' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const targetClients = (clients || []) as Client[];

    // 3. RGPD: when this is a "consent migration" campaign (config flag
    // is_onboarding_email), do NOT send a marketing email. Instead, ask
    // send-client-consent-invite to issue a token + a RGPD-compliant
    // invitation email to each recipient who has not yet been asked.
    // One-time enforcement: consent_migration_sent_at IS NULL.
    const isConsentMigration = c.config?.is_onboarding_email === true;

    // 3. Send to each client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, anonKey);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const client of targetClients) {
      if (!client.email) {
        failed++;
        continue;
      }

      try {
        if (isConsentMigration) {
          // One-time only: skip clients who have already been asked.
          if (client.consent_migration_sent_at) {
            skipped++;
            continue;
          }
          // Must still be un-consented (the audience filter should already
          // ensure this, but a defensive check protects against race
          // conditions with manual consent changes).
          if (client.marketing_consent === true) {
            skipped++;
            continue;
          }

          // send-client-consent-invite is owner/admin-gated. We invoke it
          // with the service role (supabaseAdmin.functions.invoke forwards
          // the service-role JWT, which the inner function would otherwise
          // reject via userClient.auth.getUser()). The _service_context flag
          // tells the inner function to trust this call and skip the per-user
          // auth check — the orchestrator (send-campaign) has already
          // validated the triggering user via the frontend session, and the
          // service-role JWT is the only safe way to reach this code path.
          //
          // 2026-06-29: ALSO pass `campaign_id` so the consent invite can
          // append a 1x1 tracking pixel to the HTML body. The pixel will
          // fire on first open and record the event in
          // public.email_tracking_events, which is what the campaign
          // detail UI reads back to surface per-recipient opens.
          const { error: inviteError } = await supabaseAdmin.functions.invoke(
            'send-client-consent-invite',
            { body: { client_id: client.id, _service_context: 'campaign_send', campaign_id: campaignId } },
          );

          if (inviteError) {
            console.error(
              `Failed to send consent invite to ${client.email}:`,
              inviteError.message,
            );
            failed++;
          } else {
            // Mark sent immediately so a re-run (or partial failure) does
            // not re-target the same client.
            await supabaseAdmin
              .from('clients')
              .update({ consent_migration_sent_at: new Date().toISOString() })
              .eq('id', client.id);
            sent++;
          }

          // Rate limit just like the marketing path.
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }

        // Default path: transactional email (RGPD-compliant send-email).
        const { error: sendError } = await supabaseClient.functions.invoke('send-email', {
          body: {
            to: client.email,
            subject: c.subject || c.name,
            body: stripHtml(c.content),  // plain text fallback
            html_body: c.content,         // rich HTML content
            company_id: c.company_id,
          },
        });

        if (sendError) {
          console.error(`Failed to send to ${client.email}:`, sendError.message);
          failed++;
        } else {
          sent++;
        }

        // Rate limiting: small delay between sends
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`Error sending to ${client.email}:`, err);
        failed++;
      }
    }

    // 4. Update campaign status
    await supabaseAdmin
      .from('marketing_campaigns')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        is_active: false,
      })
      .eq('id', campaignId);

    return new Response(JSON.stringify({ sent, failed, skipped }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-campaign error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});

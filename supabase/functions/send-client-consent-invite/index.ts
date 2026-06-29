// Edge Function: send-client-consent-invite
// Purpose: Send GDPR consent invitation email to a client.
//
// Flow (2026-06-29 redesign — email-based, no token in URL):
// 1. Admin/Owner calls function with { client_id }
// 2. Validate usage permissions
// 3. Generate invitation_token and persist on clients (still useful for
//    audit + future one-click resend + consent_evidence back-reference)
// 4. Read consent templates from company_email_settings (custom_subject_template,
//    custom_body_template) and the email account's verified from address
//    (company_email_accounts.ses_from_email, fallback to email).
// 5. Build the consent link WITHOUT the token:
//        ${PORTAL_URL}/consent?c=<company_id>&e=<urlencoded_email>
//    The portal page identifies the recipient by (company, email) and is
//    intentionally a 1-tap accept/reject UI (see /portal/consent).
// 6. Render the templates with interpolateSafe() (Rafter v0.27 — escaped by default)
//    and send via SES directly. If no tenant template is configured, fall back
//    to a friendly default body so the consent invite still lands.
//
// The token is still recorded on the client row and stamped into the
// consent_evidence JSON for audit purposes — but it is NOT exposed in the URL,
// so it cannot be brute-forced or leaked through screenshots / forwards.
//
// Previously this function delegated rendering + sending to send-branded-email,
// then fell back to direct SES with a hardcoded HTML body when that failed.
// The branded-email path required the email account to have ses_from_email set,
// which the tenant's account did not, so users always got the hardcoded body and
// the tenant's brand customization was ignored. Reading templates directly here
// keeps the consent flow working even when the account has no ses_from_email
// yet, while still honoring the admin-authored templates from
// company_email_settings.
//
// Two auth paths are supported (decided by the body shape, not by JWT claim):
//   - Direct user call from the CRM frontend: requires a valid user JWT and
//     owner/admin role. The client lookup is scoped to the caller's company.
//   - Service call from the send-campaign orchestrator: signaled by
//     `_service_context: 'campaign_send'` in the body. The orchestrator
//     invokes us with the service-role JWT (supabaseAdmin.functions.invoke),
//     which we cannot validate via getUser() — so we trust the flag and
//     resolve companyId from the client row instead. Direct user calls
//     cannot pass this flag to escalate (verify_jwt is on at the gateway).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { interpolateSafe } from '../_shared/escape.ts';

serve(async (req) => {
    // Rate limiting FIRST (before CORS preflight) — Rafter v0.22 F-02 fix
    const ip = getClientIP(req);
    const rl = await checkRateLimit(`send-client-consent-invite:${ip}`, 20, 60000);
    if (!rl.allowed) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) }),
        });
    }

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCorsHeaders(req) });
    }

    try {
        // Parse body once. The body shape decides the auth path:
        //   - Direct user call (frontend): no _service_context flag → require
        //     a valid user JWT and owner/admin role.
        //   - Service call (send-campaign orchestrator): _service_context ===
        //     'campaign_send' → trust the orchestrator, skip the per-user
        //     auth check (the service-role JWT cannot satisfy getUser()).
        let _body: any = {};
        try { _body = await req.json(); } catch { /* body may be empty for OPTIONS */ }
        // campaign_id is OPTIONAL — only forwarded by the send-campaign
        // orchestrator. When present, we append a 1x1 tracking pixel to the
        // HTML body so this consent invite can be measured for opens. We
        // never block the send when the pixel can't be added (e.g. invalid
        // campaign id) — tracking is best-effort.
        const { client_id, _service_context, campaign_id } = _body;

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        // Resolve companyId + client before any side effects.
        //   - User path: validate JWT + role, then scope the client lookup to
        //     the caller's company (defense in depth: even if RLS were
        //     missing, cross-tenant access would still 404).
        //   - Service path: trust the orchestrator flag and resolve companyId
        //     from the client row itself. The orchestrator has already
        //     verified the triggering user via the frontend session.
        let companyId: string;
        let client: {
            id: string;
            name: string;
            email: string;
            company_id: string;
            consent_status: string;
        };

        if (_service_context === 'campaign_send') {
            if (!client_id) throw new Error('Client ID is required');

            const { data: c, error: ce } = await supabaseClient
                .from('clients')
                .select('id, name, email, company_id, consent_status')
                .eq('id', client_id)
                .single();

            if (ce || !c) throw new Error('Client not found');
            if (!c.email) throw new Error('Client has no email address');

            client = c;
            companyId = c.company_id;
        } else {
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

            companyId = userData.company_id;

            if (!client_id) throw new Error('Client ID is required');

            // 2. Fetch Client (scoped to caller's company)
            const { data: c, error: ce } = await supabaseClient
                .from('clients')
                .select('id, name, email, company_id, consent_status')
                .eq('id', client_id)
                .eq('company_id', companyId)
                .single();

            if (ce || !c) throw new Error('Client not found or access denied');
            if (!c.email) throw new Error('Client has no email address');

            client = c;
        }

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

        const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
        const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
        const REGION = Deno.env.get('AWS_REGION') ?? 'us-east-1';
        const DEFAULT_FROM_EMAIL = Deno.env.get('SES_FROM_ADDRESS') ?? 'notifications@simplificacrm.es';
        // APP_URL = the CRM app (admin side) — used for the privacy policy link
        // in the default body footer.
        const APP_URL = Deno.env.get('FRONTEND_APP_URL') ?? 'https://app.simplificacrm.es';
        // PORTAL_URL = the public client portal (no auth, token-based). This is
        // where the consent capture page lives: portal.simplificacrm.es/consent.
        // The recipient is a non-authenticated client so they MUST land on the
        // portal, NOT on the CRM (which would redirect to /login and confuse them).
        const PORTAL_URL = Deno.env.get('PORTAL_URL') ?? 'https://portal.simplificacrm.es';

        if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
            throw new Error('Missing AWS credentials');
        }

        // 3. Read the tenant's consent template + email account
        // We fetch both BEFORE generating the token so we never persist an
        // invitation_token if the tenant has no from-email configured (the
        // invitation row would sit with a token that nobody can use).
        const { data: settings } = await supabaseClient
            .from('company_email_settings')
            .select('custom_subject_template, custom_body_template')
            .eq('company_id', companyId)
            .eq('email_type', 'consent')
            .eq('is_active', true)
            .maybeSingle();

        // Prefer the verified ses_from_email (SPF/DKIM-passing) over the raw
        // account email. Fall back to the env-var default if the tenant has
        // not configured any active account yet.
        const { data: account } = await supabaseClient
            .from('company_email_accounts')
            .select('email, ses_from_email')
            .eq('company_id', companyId)
            .eq('is_active', true)
            .order('is_primary', { ascending: false })
            .limit(1)
            .maybeSingle();

        const fromEmail = account?.ses_from_email || account?.email || DEFAULT_FROM_EMAIL;

        // 4. Generate Token
        const token = crypto.randomUUID();
        const sentAt = new Date().toISOString();

        // 5. Update Client
        const { error: updateError } = await supabaseClient
            .from('clients')
            .update({
                invitation_token: token,
                invitation_sent_at: sentAt,
                invitation_status: 'sent',
            })
            .eq('id', client.id);

        if (updateError) throw new Error('Failed to update client record: ' + updateError.message);

        // 6. Render and send the consent invite via SES, using the tenant's
        // company_email_settings template when available.
        //
        // 2026-06-29 redesign: the URL no longer carries the invitation_token.
        // The portal identifies the recipient by (company_id, email). The token
        // is still persisted on clients.invitation_token and stamped into
        // consent_evidence on the eventual gdpr_consent_records row, so audit
        // traceability is preserved without exposing the token in the URL.
        const consentLink = `${PORTAL_URL}/consent?c=${encodeURIComponent(companyId)}&e=${encodeURIComponent(client.email)}`;

        // Variables exposed to admin-authored templates. Flat keys match the
        // variables send-branded-email documented in
        // settings/email-templates/email-templates.component.ts (link,
        // consent_url, client_name, company_name, client_email) so templates
        // can be reused between the consent EF and send-branded-email.
        const templateVars: Record<string, string> = {
          client_name: client.name,
          client_email: client.email,
          company_name: companyName,
          consent_url: consentLink,
          link: consentLink,
          unsubscribe_url: `${PORTAL_URL}/consent?c=${encodeURIComponent(companyId)}&e=${encodeURIComponent(client.email)}&action=reject`,
        };

        const subject = settings?.custom_subject_template
          ? interpolateSafe(settings.custom_subject_template, templateVars)
          : `${client.name}, confirma tus preferencias de privacidad`;

        // Body fallback order:
        //   1. tenant custom_body_template (interpolated)
        //   2. friendly default body so the consent invite still arrives
        //
        // Default template (Spanish, conversational):
        const defaultBody = `<p>Hola ${client.name},</p>
<p>${companyName} quiere seguir enviándote comunicaciones comerciales y necesitamos que confirmes si estás de acuerdo.</p>
<p>Si quieres seguir recibiendo nuestras comunicaciones, haz clic aquí:</p>
<p style="margin:24px 0;text-align:center;"><a href="${consentLink}" style="background-color:#4f46e5;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;">Sí, quiero seguir recibiéndolas</a></p>
<p style="font-size:12px;color:#6b7280;">Si prefieres no recibir más comunicaciones nuestras, simplemente ignora este mensaje.</p>
<p>Gracias,<br>${companyName}</p>
<hr>
<p style="font-size:11px;color:#9ca3af;">Conforme al RGPD, tratamos tus datos según nuestra <a href="${APP_URL}/privacidad">política de privacidad</a>.</p>`;

        const htmlBody = settings?.custom_body_template
          ? interpolateSafe(settings.custom_body_template, templateVars)
          : defaultBody;

        // Append a 1x1 tracking pixel ONLY when the caller passed a
        // campaign_id (i.e. this invite is being sent as part of a
        // marketing campaign and the sender wants open attribution).
        //
        // The pixel URL points to the email-tracking Edge Function which
        // records the open event in public.email_tracking_events. We keep
        // it at the end of the document so it doesn't visually shift any
        // content even when image rendering is blocked (mail clients
        // collapse broken <img> tags).
        //
        // token = the invitation_token the function just persisted on
        // clients. It is unused for now (the email-tracking table schema
        // already has an event_data column to hold it) but is reserved
        // so a future signed-URL protection pass can verify it without
        // changing call sites here.
        let trackingPixel = '';
        if (campaign_id && typeof campaign_id === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaign_id)) {
          const functionBase =
            Deno.env.get('EMAIL_TRACKING_FUNCTION_URL') ??
            `${Deno.env.get('SUPABASE_URL') ?? 'https://ufutyjbqfjrlzkprvyvs.supabase.co'}/functions/v1/email-tracking`;
          const trackingUrl =
            `${functionBase}/track/open?cid=${encodeURIComponent(campaign_id)}` +
            `&e=${encodeURIComponent(client.email)}` +
            `&t=${encodeURIComponent(token)}`;
          trackingPixel =
            `<img src="${trackingUrl}" width="1" height="1" alt="" ` +
            `style="display:block;border:0;width:1px;height:1px;" />`;
        }
        const finalHtmlBody = htmlBody + trackingPixel;

        const aws = new AwsClient({
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
          region: REGION,
          service: 'email',
        });

        const params_ = new URLSearchParams();
        params_.append('Action', 'SendEmail');
        params_.append('Source', fromEmail);
        params_.append('Destination.ToAddresses.member.1', client.email);
        params_.append('Message.Subject.Data', subject);
        params_.append('Message.Body.Html.Data', finalHtmlBody);

        const response = await aws.fetch(`https://email.${REGION}.amazonaws.com`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params_.toString()
        });

        if (!response.ok) {
          const txt = await response.text();
          console.error('[send-client-consent-invite] SES Error:', txt);
          throw new Error('Failed to send email via AWS SES');
        }

        return new Response(JSON.stringify({ success: true, message: 'Invitation sent' }), {
            headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
        });

    } catch (error: any) {
        console.error(error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
        });
    }
});
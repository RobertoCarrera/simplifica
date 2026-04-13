// Edge Function: send-waitlist-email
// Purpose: Minimal SES email dispatcher for waitlist notifications.
//   Single responsibility: receive pre-resolved email payload (from Angular
//   after calling promote_waitlist / notify_waitlist RPCs) and send via AWS SES.
//
// IMPORTANT: No DB access. No rate limit logic. No DB queries.
//   All business logic (rate limiting, status updates, notification inserts)
//   happens in the upstream PostgreSQL RPCs. This function only sends email.
//
// Payload:
//   { to, name, service_name, start_time, end_time, type, waitlist_id? }
//   type: 'promoted' | 'passive' | 'active_notify'
//
// Auth: Basic JWT validation (user must be authenticated).
//   Data integrity is guaranteed by the upstream RPC — no admin check needed here.

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    // ── Auth: verify JWT is present and valid ──────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'missing_auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'missing_env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'invalid_token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse and validate payload ─────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { to, name, service_name, start_time, end_time, type, waitlist_id } = body;

    // Basic email format check
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!to || typeof to !== 'string' || !emailRx.test(to)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'invalid_payload',
          message: "Field 'to' must be a valid email address",
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!service_name || typeof service_name !== 'string') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'invalid_payload',
          message: "Field 'service_name' is required",
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const validTypes = ['promoted', 'passive', 'active_notify'];
    const emailType: string = validTypes.includes(type) ? type : 'promoted';

    // ── AWS SES credentials ────────────────────────────────────────────────
    const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
    const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const REGION = Deno.env.get('AWS_REGION') ?? 'us-east-1';
    const FROM_EMAIL = Deno.env.get('SES_FROM_ADDRESS') ?? 'notifications@simplificacrm.es';
    const APP_URL = Deno.env.get('FRONTEND_APP_URL') ?? 'https://app.simplificacrm.es';

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      console.error('send-waitlist-email: Missing AWS credentials');
      return new Response(JSON.stringify({ success: false, error: 'missing_aws_credentials' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Format date/time for email ─────────────────────────────────────────
    const recipientName = name || 'cliente';
    let dateFormatted = '';
    let timeFormatted = '';

    if (start_time) {
      try {
        const startDate = new Date(start_time);
        dateFormatted = startDate.toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        timeFormatted = startDate.toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        // Non-critical: date format failure should not block email
        console.warn('send-waitlist-email: Failed to format date', start_time);
      }
    }

    // ── Build email subject and body based on type ─────────────────────────
    const bookingLink = `${APP_URL}/portal/reservas`;
    const safeName = recipientName.replace(/[<>"']/g, '').substring(0, 200);
    const safeService = service_name.replace(/[<>"']/g, '').substring(0, 200);

    let subject: string;
    let bodyHeading: string;
    let bodyText: string;
    let ctaLabel: string;

    if (emailType === 'promoted') {
      subject = `¡Tu plaza está lista! - ${safeService}`;
      bodyHeading = '¡Tu plaza ha sido confirmada!';
      bodyText =
        `Se te ha asignado automáticamente una plaza para <strong>${safeService}</strong>` +
        (dateFormatted
          ? ` el <strong>${dateFormatted}</strong> a las <strong>${timeFormatted}</strong>`
          : '') +
        '. Confirma tu reserva antes de que expire.';
      ctaLabel = 'Confirmar reserva';
    } else {
      // passive or active_notify
      subject = `¡Plaza disponible! - ${safeService}`;
      bodyHeading = '¡Buenas noticias!';
      bodyText =
        `Se ha liberado una plaza para <strong>${safeService}</strong>` +
        (dateFormatted
          ? ` el <strong>${dateFormatted}</strong> a las <strong>${timeFormatted}</strong>`
          : '') +
        '. Como estás en la lista de espera, tienes prioridad para reservar.';
      ctaLabel = 'Reservar ahora';
    }

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; color: white; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0 0 8px 0; font-size: 24px;">🎉 ${bodyHeading}</h1>
          <p style="margin: 0; opacity: 0.9;">Simplifica CRM</p>
        </div>

        <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="margin: 0 0 12px 0; color: #334155;">Hola <strong>${safeName}</strong>,</p>
          <p style="margin: 0 0 12px 0; color: #334155;">${bodyText}</p>
        </div>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${bookingLink}"
             style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            ${ctaLabel}
          </a>
        </div>

        <p style="text-align: center; font-size: 12px; color: #94a3b8;">
          Si el botón no funciona, copia y pega este enlace:<br/>
          <a href="${bookingLink}" style="color: #667eea;">${bookingLink}</a>
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>
        <p style="text-align: center; font-size: 11px; color: #94a3b8;">
          Este email se ha enviado porque te apuntaste a la lista de espera en Simplifica CRM.
        </p>
      </div>
    `;

    // ── Send via AWS SES ───────────────────────────────────────────────────
    const aws = new AwsClient({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: REGION,
      service: 'email',
    });

    const params = new URLSearchParams();
    params.append('Action', 'SendEmail');
    params.append('Source', FROM_EMAIL);
    params.append('Destination.ToAddresses.member.1', to);
    params.append('Message.Subject.Data', subject.replace(/[\r\n]/g, ' ').substring(0, 998));
    params.append('Message.Body.Html.Data', htmlBody.substring(0, 200000));

    const sesResponse = await aws.fetch(`https://email.${REGION}.amazonaws.com`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!sesResponse.ok) {
      const errText = await sesResponse.text();
      console.error('send-waitlist-email: SES error:', errText);
      return new Response(
        JSON.stringify({ success: false, error: 'ses_error', message: errText.substring(0, 500) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        to,
        type: emailType,
        waitlist_id: waitlist_id ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('send-waitlist-email: Unhandled error:', error);
    return new Response(JSON.stringify({ success: false, error: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

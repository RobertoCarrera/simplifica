// Edge Function: notify-waitlist
// Purpose: When a booking is cancelled/deleted, notify the first pending waitlist member
// via email (AWS SES) that a spot has opened up.
// Expects body: { service_id, start_time, end_time, company_id }

// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    // Authentication — verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "missing_env",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify JWT
    const token = authHeader!.replace('Bearer ', '');
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { service_id, start_time, end_time } = body;

    if (!service_id || !start_time || !end_time) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "invalid_request",
          message:
            "Required fields: service_id, start_time, end_time",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Derive company_id from the authenticated user (never trust request body)
    const { data: userProfile, error: profileErr } = await supabaseAdmin
      .from('users')
      .select('company_id, app_role:app_roles(name)')
      .eq('auth_user_id', user!.id)
      .single();
    if (profileErr || !userProfile?.company_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'User profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const roleName = (userProfile as any).app_role?.name;
    if (!['admin', 'owner', 'super_admin'].includes(roleName)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const company_id = userProfile.company_id;

    // 1. Find the first pending waitlist entry for this service+slot
    const { data: waitlistEntries, error: wlError } = await supabaseAdmin
      .from("waitlist")
      .select("id, client_id, service_id, start_time, end_time")
      .eq("service_id", service_id)
      .eq("start_time", start_time)
      .eq("end_time", end_time)
      .eq("company_id", company_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    if (wlError) {
      console.error("notify-waitlist: Error querying waitlist", wlError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "db_error",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!waitlistEntries || waitlistEntries.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending waitlist entries for this slot",
          notified: false,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const entry = waitlistEntries[0];

    // 2. Get client email from the clients table
    const { data: client, error: clientErr } = await supabaseAdmin
      .from("clients")
      .select("id, name, email")
      .eq("id", entry.client_id)
      .single();

    if (clientErr || !client?.email) {
      console.error(
        "notify-waitlist: Client not found or no email",
        clientErr
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "client_not_found",
          message: "Client not found or has no email",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Get service name for the email
    const { data: service } = await supabaseAdmin
      .from("services")
      .select("name")
      .eq("id", service_id)
      .single();

    const serviceName = service?.name || "un servicio";

    // 4. Format the date/time for the email
    const startDate = new Date(start_time);
    const dateFormatted = startDate.toLocaleDateString("es-ES", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeFormatted = startDate.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // 5. Send email via AWS SES
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const REGION = Deno.env.get("AWS_REGION") ?? "us-east-1";
    const FROM_EMAIL =
      Deno.env.get("SES_FROM_ADDRESS") ?? "notifications@simplificacrm.es";
    const APP_URL =
      Deno.env.get("FRONTEND_APP_URL") ?? "https://app.simplificacrm.es";

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      console.error("notify-waitlist: Missing AWS credentials");
      // Still update status even if email fails
      await supabaseAdmin
        .from("waitlist")
        .update({ status: "notified", updated_at: new Date().toISOString() })
        .eq("id", entry.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: "missing_aws_credentials",
          message: "AWS credentials not configured, but waitlist status updated",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const aws = new AwsClient({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: REGION,
      service: "email",
    });

    const bookingLink = `${APP_URL}/portal/reservas`;
    const subject = `¡Plaza disponible! - ${serviceName}`;
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; color: white; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0 0 8px 0; font-size: 24px;">🎉 ¡Buenas noticias!</h1>
          <p style="margin: 0; opacity: 0.9;">Se ha liberado una plaza</p>
        </div>

        <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="margin: 0 0 12px 0; color: #334155;">Hola <strong>${client.name || "cliente"}</strong>,</p>
          <p style="margin: 0 0 12px 0; color: #334155;">
            Se ha liberado una plaza para <strong>${serviceName}</strong> el <strong>${dateFormatted}</strong> a las <strong>${timeFormatted}</strong>.
          </p>
          <p style="margin: 0; color: #334155;">
            Como estás en la lista de espera, tienes prioridad para reservar este hueco.
          </p>
        </div>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${bookingLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Reservar ahora
          </a>
        </div>

        <p style="text-align: center; font-size: 12px; color: #94a3b8;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
          <a href="${bookingLink}" style="color: #667eea;">${bookingLink}</a>
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>
        <p style="text-align: center; font-size: 11px; color: #94a3b8;">
          Este email se ha enviado porque te apuntaste a la lista de espera en Simplifica CRM.
        </p>
      </div>
    `;

    const params = new URLSearchParams();
    params.append("Action", "SendEmail");
    params.append("Source", FROM_EMAIL);
    params.append("Destination.ToAddresses.member.1", client.email);
    params.append("Message.Subject.Data", subject);
    params.append("Message.Body.Html.Data", htmlBody);

    const response = await aws.fetch(
      `https://email.${REGION}.amazonaws.com`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const txt = await response.text();
      console.error("notify-waitlist: SES Error:", txt);
    }

    // 6. Update waitlist entry status to 'notified'
    await supabaseAdmin
      .from("waitlist")
      .update({ status: "notified", updated_at: new Date().toISOString() })
      .eq("id", entry.id);

    return new Response(
      JSON.stringify({
        success: true,
        notified: true,
        waitlist_id: entry.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("notify-waitlist: Unhandled error:", error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

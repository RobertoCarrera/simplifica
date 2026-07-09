// supabase/functions/notify-session-created/index.ts
// Called by DB trigger trg_notify_session_created via pg_net
// Creates an in-app notification for the professional when an external booking is created.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limiter.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SessionCreatedPayload {
  booking_id: string;
  company_id: string;
  professional_id: string;
  client_id: string | null;
  customer_name: string;
  start_time: string;
  source: string;
}

serve(async (req) => {
  // Rate limit by IP (Rafter v0.45 — MEDIUM severity hardening, 600/min/IP)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          || req.headers.get("x-real-ip")
          || "unknown";
  const rateCheck = await checkRateLimit(`notify-session-created:${ip}`, 600, 60_000);
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429, headers: { "Content-Type": "application/json", ...getRateLimitHeaders(rateCheck) } }
    );
  }

  // ── v2 auth (internal trigger only): apikey header | legacy Bearer service_role ──
  // No user-JWT branch — this EF is only called by DB trigger via pg_net (trigger-only, dead code today per audit #2 but kept safe).
  const apikeyHdr = req.headers.get("apikey") ?? "";
  const bearerTok = (req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i) || [])[1] ?? "";
  const VALID_KEYS = new Set<string>([SERVICE_ROLE_KEY]);
  for (const v of Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")))      if (typeof v === "string") VALID_KEYS.add(v);
  // Rafter v0.63 R-44D54: removed SUPABASE_PUBLISHABLE_KEYS loop.
  // Publishable key is PUBLIC (embedded in the frontend bundle); including it
  // in the auth bypass set would let any internet caller invoke this trigger
  // endpoint with the publishable key from the frontend bundle.
  const authed = (apikeyHdr && VALID_KEYS.has(apikeyHdr)) || bearerTok === SERVICE_ROLE_KEY;
  if (!authed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: SessionCreatedPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { booking_id, company_id, professional_id, client_id, customer_name, start_time, source } = payload;

  if (!booking_id || !company_id || !professional_id) {
    console.warn("[notify-session-created] Missing required fields, skipping");
    return new Response(JSON.stringify({ success: false, error: "missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Idempotency: check if notification already exists for this booking
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("reference_id", booking_id)
    .eq("type", "session_created")
    .limit(1)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ success: true, notification_id: existing.id, skipped: "duplicate" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Fetch professional's user_id
  const { data: professional } = await supabase
    .from("professionals")
    .select("user_id, is_active")
    .eq("id", professional_id)
    .maybeSingle();

  if (!professional?.user_id) {
    console.warn(`[notify-session-created] No user found for professional ${professional_id}, skipping`);
    return new Response(JSON.stringify({ success: true, skipped: "no_professional" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Resolve client name
  let clientName = customer_name;
  if (!clientName) {
    clientName = "Cliente no registrado";
  }

  if (client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("name, surname")
      .eq("id", client_id)
      .maybeSingle();
    if (client?.name) {
      clientName = client.surname
        ? `${client.name} ${client.surname}`
        : client.name;
    }
  }

  // 4. Parse start_time for human-readable content
  let content = "";
  try {
    const dt = new Date(start_time);
    const timeZone = "Europe/Madrid";
    const dateStr = dt.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone });
    const timeStr = dt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone });
    content = `Tienes una nueva sesión programada para el ${dateStr} a las ${timeStr} con ${clientName}`;
  } catch {
    content = `Tienes una nueva sesión programada con ${clientName}`;
  }

  // 5. Build notification
  const notification = {
    company_id,
    recipient_id: professional.user_id,
    type: "session_created",
    category: "session",
    reference_id: booking_id,
    title: "Nueva sesión",
    content,
    link: `/agenda/session/${booking_id}`,
    priority: "medium",
    metadata: {
      source,
      client_name: clientName,
      start_time,
      professional_id,
      category: "session",
    },
  };

  // 6. Insert notification
  const { data: inserted, error: insertErr } = await supabase
    .from("notifications")
    .insert(notification)
    .select("id")
    .single();

  if (insertErr) {
    console.error("[notify-session-created] Insert error:", insertErr.message);
    return new Response(JSON.stringify({ error: insertErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[notify-session-created] Created notification ${inserted.id} for booking ${booking_id}`);
  return new Response(JSON.stringify({ success: true, notification_id: inserted.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

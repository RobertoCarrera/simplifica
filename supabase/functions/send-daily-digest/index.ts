// supabase/functions/send-daily-digest/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limiter.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
serve(async (req) => {
  // Rate limit by IP (Rafter v0.45 — MEDIUM severity hardening, 600/min/IP)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          || req.headers.get("x-real-ip")
          || "unknown";
  const rateCheck = await checkRateLimit(`send-daily-digest:${ip}`, 600, 60_000);
  if (!rateCheck.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "Content-Type": "application/json", ...getRateLimitHeaders(rateCheck) } });
  }

  // ── v2 auth (internal cron only): apikey header | legacy Bearer service_role ──
  // No user-JWT branch — this EF is only called by pg_cron `send-daily-digest-15min`.
  const apikeyHdr = req.headers.get("apikey") ?? "";
  const bearerTok = (req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i) || [])[1] ?? "";
  const VALID_KEYS = new Set<string>([SERVICE_ROLE_KEY]);
  for (const v of Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")))      if (typeof v === "string") VALID_KEYS.add(v);
  // Rafter v0.63 R-44D54: removed SUPABASE_PUBLISHABLE_KEYS loop.
  // Publishable key is PUBLIC (embedded in the frontend bundle); including it
  // in the auth bypass set would let any internet caller invoke this cron
  // endpoint with the publishable key from the frontend bundle.
  const authed = (apikeyHdr && VALID_KEYS.has(apikeyHdr)) || bearerTok === SERVICE_ROLE_KEY;
  if (!authed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: companies, error: companiesErr } = await supabase.from("companies").select("id, settings").eq("is_active", true);
  if (companiesErr) {
    return new Response(JSON.stringify({ error: companiesErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  if (!companies?.length) {
    return new Response(JSON.stringify({ companies_processed: 0, notifications_sent: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  const currentTotalMins = currentHour * 60 + currentMinute;
  const { data: ownerRole } = await supabase.from("app_roles").select("id").eq("name", "owner").maybeSingle();
  let companiesProcessed = 0;
  let notificationsSent = 0;
  for (const company of companies) {
    const settings = (company.settings as Record<string, unknown>) ?? {};
    const digestTime: string = (settings.daily_digest_time as string) ?? "20:00";
    const timeParts = digestTime.split(":");
    const targetHour = parseInt(timeParts[0] ?? "20", 10);
    const targetMinute = parseInt(timeParts[1] ?? "0", 10);
    const targetTotalMins = targetHour * 60 + targetMinute;
    const diff = Math.abs(currentTotalMins - targetTotalMins);
    if (diff > 7 && diff < 60 * 24 - 7) { continue; }
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const { data: bookings, error: bookingsErr } = await supabase.from("bookings").select("id").eq("company_id", company.id)
      .gte("start_time", `${yesterdayStr}T00:00:00Z`).lt("start_time", `${yesterdayStr}T23:59:59Z`)
      .neq("source", "internal").in("status", ["confirmed", "pending"]);
    if (bookingsErr) { console.error(`[send-daily-digest] Bookings error for ${company.id}:`, bookingsErr.message); continue; }
    if (!bookings?.length) { continue; }
    const count = bookings.length;
    let ownerUserIds: string[] = [];
    if (ownerRole) {
      const { data: owners } = await supabase.from("company_members").select("user_id").eq("company_id", company.id).eq("role_id", ownerRole.id).eq("status", "active");
      if (owners) { ownerUserIds = owners.map((o) => o.user_id).filter((id) => id != null); }
    }
    if (ownerUserIds.length === 0) {
      const { data: owners } = await supabase.from("company_members").select("user_id").eq("company_id", company.id).eq("role", "owner").eq("status", "active");
      if (owners) { ownerUserIds = owners.map((o) => o.user_id).filter((id) => id != null); }
    }
    if (!ownerUserIds.length) { console.warn(`[send-daily-digest] No owners for company ${company.id}`); continue; }
    const sessionLabel = count === 1 ? "sesión" : "sesiones";
    const content = `Hoy se han conseguido ${count} ${sessionLabel}.`;
    for (const ownerUserId of ownerUserIds) {
      const { error: insertErr } = await supabase.from("notifications").insert({
        company_id: company.id, recipient_id: ownerUserId, type: "daily_session_digest", reference_id: company.id,
        title: "Resumen diario de sesiones", content, priority: "low",
        metadata: { date: yesterdayStr, count, category: "datos" },
      });
      if (insertErr) { console.error(`[send-daily-digest] Insert error for ${ownerUserId}:`, insertErr.message); }
      else { notificationsSent++; }
    }
    companiesProcessed++;
  }
  const result = { companies_processed: companiesProcessed, notifications_sent: notificationsSent };
  return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
});
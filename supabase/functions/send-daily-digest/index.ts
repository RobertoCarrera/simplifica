// supabase/functions/send-daily-digest/index.ts
// Called by pg_cron on a schedule.
// Queries yesterday's external bookings per company and notifies owners.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (token && token !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Fetch all active companies
  const { data: companies, error: companiesErr } = await supabase
    .from("companies")
    .select("id, settings")
    .eq("is_active", true);

  if (companiesErr) {
    console.error("[send-daily-digest] Companies fetch error:", companiesErr.message);
    return new Response(JSON.stringify({ error: companiesErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!companies?.length) {
    return new Response(JSON.stringify({ companies_processed: 0, notifications_sent: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Get current UTC time for time-window check
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  // Window: within 15 minutes of target hour
  const currentTotalMins = currentHour * 60 + currentMinute;

  // 3. Get owner role id once
  const { data: ownerRole } = await supabase
    .from("app_roles")
    .select("id")
    .eq("name", "owner")
    .maybeSingle();

  let companiesProcessed = 0;
  let notificationsSent = 0;

  for (const company of companies) {
    const settings = (company.settings as Record<string, unknown>) ?? {};
    const digestTime: string = (settings.daily_digest_time as string) ?? "20:00";

    // Parse digest time (HH:MM)
    const timeParts = digestTime.split(":");
    const targetHour = parseInt(timeParts[0] ?? "20", 10);
    const targetMinute = parseInt(timeParts[1] ?? "0", 10);
    const targetTotalMins = targetHour * 60 + targetMinute;

    // Check if current time is within ±7 minutes of target (15-min window)
    const diff = Math.abs(currentTotalMins - targetTotalMins);
    if (diff > 7 && diff < 60 * 24 - 7) {
      // Not in window — skip this company
      continue;
    }

    // 4. Query yesterday's bookings for this company
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0]; // YYYY-MM-DD

    const { data: bookings, error: bookingsErr } = await supabase
      .from("bookings")
      .select("id")
      .eq("company_id", company.id)
      .gte("start_time", `${yesterdayStr}T00:00:00Z`)
      .lt("start_time", `${yesterdayStr}T23:59:59Z`)
      .neq("source", "internal")
      .in("status", ["confirmed", "pending"]);

    if (bookingsErr) {
      console.error(`[send-daily-digest] Bookings query error for company ${company.id}:`, bookingsErr.message);
      continue;
    }

    if (!bookings?.length) {
      // No qualifying bookings — skip
      continue;
    }

    const count = bookings.length;

    // 5. Find all owners for this company
    let ownerUserIds: string[] = [];

    if (ownerRole) {
      const { data: owners } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", company.id)
        .eq("role_id", ownerRole.id)
        .eq("status", "active");

      if (owners) {
        ownerUserIds = owners.map((o) => o.user_id).filter((id) => id != null);
      }
    }

    // Fallback: also check legacy `role` text column
    if (ownerUserIds.length === 0) {
      const { data: owners } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", company.id)
        .eq("role", "owner")
        .eq("status", "active");

      if (owners) {
        ownerUserIds = owners.map((o) => o.user_id).filter((id) => id != null);
      }
    }

    if (!ownerUserIds.length) {
      console.warn(`[send-daily-digest] No owners found for company ${company.id}, skipping`);
      continue;
    }

    // 6. Plural-aware content
    const sessionLabel = count === 1 ? "sesión" : "sesiones";
    const content = `Hoy se han conseguido ${count} ${sessionLabel}.`;

    // 7. Insert one notification per owner
    for (const ownerUserId of ownerUserIds) {
      const { error: insertErr } = await supabase
        .from("notifications")
        .insert({
          company_id: company.id,
          recipient_id: ownerUserId,
          type: "daily_session_digest",
          reference_id: company.id,
          title: "Resumen diario de sesiones",
          content,
          priority: "low",
          metadata: {
            date: yesterdayStr,
            count,
            category: "datos",
          },
        });

      if (insertErr) {
        console.error(`[send-daily-digest] Notification insert error for owner ${ownerUserId}:`, insertErr.message);
      } else {
        notificationsSent++;
      }
    }

    companiesProcessed++;
  }

  const result = { companies_processed: companiesProcessed, notifications_sent: notificationsSent };
  console.log("[send-daily-digest] Done:", JSON.stringify(result));

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

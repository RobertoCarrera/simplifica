// @ts-nocheck
// Edge Function: reorder-stages
// Accepts an ordered array of generic stage IDs and stores per-company order in company_stage_order

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOW_ALL_ORIGINS = Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];

function cors(origin: string | null): HeadersInit {
  const h: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
  if (origin) {
    if (ALLOW_ALL_ORIGINS || ALLOWED_ORIGINS.includes(origin)) {
      h["Access-Control-Allow-Origin"] = origin;
      h["Access-Control-Allow-Credentials"] = "true";
    }
  }
  return h;
}

function originOk(origin: string | null) {
  return !!origin && (ALLOW_ALL_ORIGINS || ALLOWED_ORIGINS.includes(origin));
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  if (!originOk(origin)) return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid authorization" }), { status: 401, headers });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401, headers });

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.stage_ids)) {
      return new Response(JSON.stringify({ error: "stage_ids (array) is required" }), { status: 400, headers });
    }
    const stageIds: string[] = body.stage_ids;

    // Resolve company_id and users.id for the caller
    const { data: userRow, error: uErr } = await admin
      .from("users")
      .select("id, company_id")
      .eq("auth_user_id", user.id)
      .single();
    if (uErr || !userRow?.company_id) return new Response(JSON.stringify({ error: "User not associated with a company" }), { status: 400, headers });
    const companyId = userRow.company_id;

    // Validate all provided stages are generic
    const { data: stages, error: sErr } = await admin
      .from("ticket_stages")
      .select("id, company_id")
      .in("id", stageIds);
    if (sErr) return new Response(JSON.stringify({ error: sErr.message }), { status: 500, headers });
    if ((stages || []).some((s: any) => s.company_id !== null)) {
      return new Response(JSON.stringify({ error: "Only generic stages can be reordered with this endpoint" }), { status: 400, headers });
    }

    // Upsert overlay positions
    // We set position based on array order: index 0..n
    const rows = stageIds.map((id, index) => ({ company_id: companyId, stage_id: id, position: index }));
    const { error: upErr } = await admin.from("company_stage_order").upsert(rows, { onConflict: "company_id,stage_id" });
    if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers });

    return new Response(JSON.stringify({ ok: true, count: rows.length }), { status: 200, headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Internal server error", details: e?.message }), { status: 500, headers });
  }
});

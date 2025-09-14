// Edge Function: create-locality (Deno serve pattern)
// Deploy path: functions/v1/create-locality
// Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// CORS controlled by: ALLOW_ALL_ORIGINS (true/false), ALLOWED_ORIGINS (comma-separated)

// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(origin?: string) {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowedOrigins.includes(origin));
  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : (allowAll ? "*" : ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  } as Record<string, string>;
}

function isAllowedOrigin(origin?: string) {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  if (allowAll) return true;
  // If no origin (server-to-server), allow
  if (!origin) return true;
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowedOrigins.includes(origin);
}

serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    try { console.log("Create-locality OPTIONS preflight received", { origin }); } catch {}
    return new Response("ok", { headers: { ...corsHeaders, "Content-Type": "text/plain" } });
  }

  // Enforce allowed origins
  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed", allowed: ["POST", "OPTIONS"] }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("URL_SUPABASE") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing Supabase env configuration" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Admin client (Service Role)
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Require Authorization: Bearer <jwt>
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authorization Bearer token required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({} as any));
    // Strict input: accept ONLY canonical p_* fields
    const receivedKeys = Object.keys(body || {});
    const name = typeof body?.p_name === "string" ? body.p_name.trim() : "";
    const province = body?.p_province != null ? String(body.p_province).trim() : null;
    const country = body?.p_country != null ? String(body.p_country).trim() : null;
    const postalRaw = typeof body?.p_postal_code === "string" || typeof body?.p_postal_code === "number" ? String(body.p_postal_code) : "";
    // Normalize postal code: keep digits only
    const normalized_cp = postalRaw.replace(/\D+/g, "").trim();

    if (!name || !normalized_cp) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: p_name and p_postal_code",
          details: {
            required: ["p_name", "p_postal_code"],
            optional: ["p_province", "p_country"],
            received_keys: receivedKeys,
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Create-locality POST", { origin, name, postal_code: normalized_cp });

    // Try RPC first
    let row: any = null;
    try {
      const { data, error } = await supabaseAdmin.rpc("insert_or_get_locality", { p_name: name, p_province: province, p_country: country, p_postal_code: normalized_cp });
      if (!error && data) {
        row = Array.isArray(data) ? data[0] : data;
      } else if (error) {
        console.warn("RPC insert_or_get_locality failed, will fallback to upsert:", error.message || String(error));
      }
    } catch (rpcErr) {
      console.warn("RPC threw exception, fallback to upsert:", (rpcErr as any)?.message || String(rpcErr));
    }

    // Fallback: upsert with onConflict postal_code using service_role (bypasses RLS)
    if (!row) {
      const payload = {
        name,
        province,
        country,
        postal_code: normalized_cp,
      } as any;
      const { data: upsertData, error: upsertError } = await supabaseAdmin
        .from("localities")
        .upsert(payload, { onConflict: "postal_code" })
        .select()
        .single();

      if (upsertError) {
        console.error("Upsert localities failed:", upsertError);
        return new Response(JSON.stringify({ error: upsertError.message || String(upsertError) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      row = upsertData;
    }

    return new Response(JSON.stringify({ result: row }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("Create-locality exception", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

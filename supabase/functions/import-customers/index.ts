// Edge Function: import-customers (Deno serve pattern)
// Deploy path: functions/v1/import-customers
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
  if (!origin) return true; // server-to-server
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowedOrigins.includes(origin);
}

serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    try { console.log("import-customers OPTIONS preflight", { origin }); } catch {}
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

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Require Authorization: Bearer <jwt>
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authorization Bearer token required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate token and derive user's company_id
    const token = authHeader.split(" ")[1];
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authUserId = userData.user.id;

    let authoritativeCompanyId: string | null = null;
    try {
      const { data: appUsers, error: appUsersErr } = await supabaseAdmin
        .from("users")
        .select("company_id")
        .eq("auth_user_id", authUserId)
        .limit(1);
      if (appUsersErr) console.error("import-customers: users mapping error", appUsersErr);
      if (appUsers && appUsers.length) authoritativeCompanyId = appUsers[0].company_id || null;
    } catch (mapErr) {
      console.error("import-customers: users mapping exception", mapErr);
    }

    if (!authoritativeCompanyId) {
      return new Response(JSON.stringify({ error: "Authenticated user has no associated company (forbidden)" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = await req.json().catch(() => ({}));
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ inserted: [], errors: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("import-customers: begin", { count: rows.length, companyId: authoritativeCompanyId });
    const prepared: any[] = [];
    const errors: any[] = [];

    for (const r of rows) {
      const name = r.name || r.nombre || "";
      const surname = r.surname || r.apellidos || r.last_name || "";
      const email = r.email || r.correo || null;
      const row: any = {
        name: name || "Cliente importado",
        apellidos: surname || undefined,
        email,
        phone: r.phone || r.telefono || null,
        dni: r.dni || r.nif || null,
        company_id: authoritativeCompanyId,
        created_at: new Date().toISOString(),
      };
      if (r.metadata) {
        try { row.metadata = typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata; }
        catch { row.metadata_raw = r.metadata; }
      }
      if (!email) { errors.push({ error: "missing email", row }); continue; }
      prepared.push(row);
    }

    const inserted: any[] = [];
    const chunkSize = 100;
    for (let i = 0; i < prepared.length; i += chunkSize) {
      const chunk = prepared.slice(i, i + chunkSize);
      try {
        const { data, error } = await supabaseAdmin.from("clients").insert(chunk).select();
        if (error) {
          console.warn("import-customers: batch insert failed, fallback per-row", { i, count: chunk.length, error: error.message || error });
          for (const row of chunk) {
            try {
              const { data: one, error: oneErr } = await supabaseAdmin.from("clients").insert([row]).select().limit(1);
              if (oneErr) errors.push({ error: oneErr.message || oneErr, row });
              else inserted.push(Array.isArray(one) ? one[0] : one);
            } catch (e: any) {
              errors.push({ error: e?.message || String(e), row });
            }
          }
        } else {
          if (Array.isArray(data)) inserted.push(...data); else if (data) inserted.push(data);
        }
      } catch (e: any) {
        console.warn("import-customers: chunk exception, fallback per-row", { i, count: chunk.length, err: e?.message || String(e) });
        for (const row of chunk) {
          try {
            const { data: one, error: oneErr } = await supabaseAdmin.from("clients").insert([row]).select().limit(1);
            if (oneErr) errors.push({ error: oneErr.message || oneErr, row });
            else inserted.push(Array.isArray(one) ? one[0] : one);
          } catch (ee: any) {
            errors.push({ error: ee?.message || String(ee), row });
          }
        }
      }
    }

    return new Response(JSON.stringify({ inserted, errors }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("import-customers exception", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

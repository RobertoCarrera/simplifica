// @ts-nocheck
// =====================================================
// Edge Function: hide-unit
// =====================================================
// Oculta o muestra unidades genéricas (service_units con company_id IS NULL)
// para la empresa del usuario autenticado. Similar a hide-stage.
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS config
const ALLOW_ALL_ORIGINS = Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (origin) {
    if (ALLOW_ALL_ORIGINS) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Credentials"] = "true";
    } else if (ALLOWED_ORIGINS.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Credentials"] = "true";
    }
  }
  return headers;
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOW_ALL_ORIGINS || ALLOWED_ORIGINS.includes(origin);
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid authorization" }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace("Bearer ", "");

    const { p_unit_id, p_operation } = await req.json();
    if (!p_unit_id || !["hide", "unhide"].includes(p_operation)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // Validate user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401, headers: corsHeaders });
    }

    // Resolve company_id and users.id (hidden_by)
    const { data: urow, error: uerr } = await supabaseAdmin
      .from("users")
      .select("id, company_id")
      .eq("auth_user_id", user.id)
      .single();

    if (uerr || !urow?.company_id) {
      return new Response(JSON.stringify({ error: "User not associated with a company" }), { status: 400, headers: corsHeaders });
    }
    const companyId = urow.company_id;
    const appUserId = urow.id; // public.users.id

    // Validate that unit is generic
    const { data: unit, error: unitError } = await supabaseAdmin
      .from("service_units")
      .select("id, company_id")
      .eq("id", p_unit_id)
      .single();

    if (unitError || !unit) {
      return new Response(JSON.stringify({ error: "Unit not found" }), { status: 404, headers: corsHeaders });
    }
    if (unit.company_id !== null) {
      return new Response(JSON.stringify({ error: "Only generic units can be hidden" }), { status: 400, headers: corsHeaders });
    }

    if (p_operation === "hide") {
      // Upsert hide
      const { error: hideErr } = await supabaseAdmin
        .from("hidden_units")
        .upsert({ company_id: companyId, unit_id: p_unit_id, hidden_by: appUserId }, { onConflict: "company_id,unit_id" });
      if (hideErr) {
        const msg = (hideErr.message || '').toLowerCase();
        if (
          msg.includes('not exist') ||
          msg.includes('not found') ||
          msg.includes('could not find the resource') ||
          (msg.includes('relation') && msg.includes('does not exist'))
        ) {
          return new Response(JSON.stringify({ error: 'hidden_units table missing', hint: 'Create table hidden_units with unique (company_id, unit_id) and proper FKs' }), { status: 400, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: hideErr.message }), { status: 500, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ result: "hidden" }), { status: 200, headers: corsHeaders });
    } else {
      // Remove hide
      const { error: unhideErr } = await supabaseAdmin
        .from("hidden_units")
        .delete()
        .match({ company_id: companyId, unit_id: p_unit_id });
      if (unhideErr) {
        const msg = (unhideErr.message || '').toLowerCase();
        if (
          msg.includes('not exist') ||
          msg.includes('not found') ||
          msg.includes('could not find the resource') ||
          (msg.includes('relation') && msg.includes('does not exist'))
        ) {
          return new Response(JSON.stringify({ error: 'hidden_units table missing', hint: 'Create table hidden_units with unique (company_id, unit_id) and proper FKs' }), { status: 400, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: unhideErr.message }), { status: 500, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ result: "unhidden" }), { status: 200, headers: corsHeaders });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Internal server error", details: e?.message }), { status: 500, headers: getCorsHeaders(req.headers.get("origin")) });
  }
});

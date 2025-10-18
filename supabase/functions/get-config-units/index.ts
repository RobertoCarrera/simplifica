// @ts-nocheck
// =====================================================
// Edge Function: get-config-units
// =====================================================
// Devuelve unidades genéricas (service_units company_id IS NULL)
// anotadas con is_hidden para la empresa del usuario autenticado.
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOW_ALL_ORIGINS = Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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
  if (req.method !== "GET") {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // User and company
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401, headers: corsHeaders });
    }
    const { data: urow, error: uerr } = await supabaseAdmin
      .from("users")
      .select("company_id")
      .eq("auth_user_id", user.id)
      .single();
    if (uerr || !urow?.company_id) {
      return new Response(JSON.stringify({ error: "User not associated with a company" }), { status: 400, headers: corsHeaders });
    }
    const companyId = urow.company_id;

    // Generic units
    const { data: units, error: unitsError } = await supabaseAdmin
      .from("service_units")
      .select("id, name, code, description, is_active, company_id, created_at, updated_at, deleted_at")
      .is("company_id", null)
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (unitsError) {
      return new Response(JSON.stringify({ error: unitsError.message }), { status: 500, headers: corsHeaders });
    }

    // Hidden per company
    let hiddenIds = new Set<string>();
    try {
      const { data: hidden, error: hiddenError } = await supabaseAdmin
        .from("hidden_units")
        .select("unit_id")
        .eq("company_id", companyId);
      if (hiddenError) {
        const msg = (hiddenError.message || '').toLowerCase();
        // If the table/resource doesn't exist yet, treat as no hidden units
        if (
          msg.includes('not exist') ||
          msg.includes('not found') ||
          msg.includes('could not find the resource') ||
          msg.includes('relation') && msg.includes('does not exist')
        ) {
          // leave hiddenIds empty
        } else {
          return new Response(JSON.stringify({ error: hiddenError.message }), { status: 500, headers: corsHeaders });
        }
      } else {
        hiddenIds = new Set((hidden || []).map((h: any) => h.unit_id));
      }
    } catch (he: any) {
      // On unexpected errors querying hidden_units, default to none hidden
      console.warn('hidden_units query failed, defaulting to empty set:', he?.message);
    }
    
    const result = (units || []).map((u: any) => ({ ...u, is_hidden: hiddenIds.has(u.id) }));

    return new Response(JSON.stringify({ units: result }), { status: 200, headers: corsHeaders });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Internal server error", details: e?.message }), { status: 500, headers: corsHeaders });
  }
});

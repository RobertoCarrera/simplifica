// @ts-nocheck
// =====================================================
// Edge Function: get-company-branding
// =====================================================
// Devuelve los datos de branding públicos de la compañía
// del usuario autenticado para uso en agenda/portal.
//
// Respuesta: { name, logo_url, primary_color, secondary_color }
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuración CORS
const ALLOW_ALL_ORIGINS = !(Deno.env.get("SUPABASE_URL") || "").startsWith("https://") && Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
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
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  try {
    // --- Autenticación (Bearer token) ---
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid authorization" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // --- Validar usuario y extraer company_id ---
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { data: userRow, error: userRowError } = await supabaseAdmin
      .from("users")
      .select("company_id")
      .eq("auth_user_id", user.id)
      .single();

    if (userRowError || !userRow?.company_id) {
      return new Response(JSON.stringify({ error: "User not associated with a company" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const companyId = userRow.company_id;

    // --- Obtener branding de la compañía (solo columnas necesarias) ---
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("name, logo_url, settings")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // --- Extraer colores del JSON settings->branding ---
    const branding: Record<string, string> = (company as any).settings?.branding ?? {};
    const primaryColor = branding.primary_color ?? "#10B981";
    const secondaryColor = branding.secondary_color ?? "#3B82F6";

    return new Response(
      JSON.stringify({
        name: company.name,
        logo_url: company.logo_url ?? null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (e: any) {
    console.error("[get-company-branding] Unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

// @ts-nocheck
// =====================================================
// Edge Function: get-config-stages
// =====================================================
// Devuelve los estados genéricos (company_id IS NULL) para la pantalla
// de Configuración, anotados con la propiedad is_hidden para la empresa
// del usuario autenticado.
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuración CORS (mismo patrón que hide-stage)
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
    // Token requerido
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

    // Validar usuario y resolver company_id
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Permitir sobreescritura opcional de company_id vía query param (sólo si pertenece al usuario)
    const urlObj = new URL(req.url);
    const qCompany = urlObj.searchParams.get('company_id');

    let companyId: string | null = null;
    if (qCompany) {
      // Validar que el usuario realmente pertenece a qCompany
      const { data: uRow, error: uErr } = await supabaseAdmin
        .from('users')
        .select('company_id')
        .eq('auth_user_id', user.id)
        .single();
      if (uErr || !uRow?.company_id || uRow.company_id !== qCompany) {
        return new Response(JSON.stringify({ error: 'Forbidden company_id' }), { status: 403, headers: corsHeaders });
      }
      companyId = qCompany;
    } else {
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
      companyId = userRow.company_id;
    }

    // Obtener estados genéricos
    const { data: stages, error: stagesError } = await supabaseAdmin
      .from("ticket_stages")
      .select("id, name, position, color, company_id, created_at, updated_at, deleted_at")
      .is("company_id", null)
      .is("deleted_at", null)
      .order("position", { ascending: true });

    if (stagesError) {
      return new Response(JSON.stringify({ error: stagesError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Obtener ocultos para la empresa
    const { data: hidden, error: hiddenError } = await supabaseAdmin
      .from("hidden_stages")
      .select("stage_id")
      .eq("company_id", companyId);

    if (hiddenError) {
      return new Response(JSON.stringify({ error: hiddenError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Leer overlay de orden por empresa
    const { data: overlay, error: oErr } = await supabaseAdmin
      .from("company_stage_order")
      .select("stage_id, position")
      .eq("company_id", companyId);
    if (oErr) {
      return new Response(JSON.stringify({ error: oErr.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const hiddenIds = new Set((hidden || []).map((h: any) => h.stage_id));
    const overlayMap = new Map((overlay || []).map((o: any) => [o.stage_id, o.position]));

    const result = (stages || [])
      .map((s: any) => ({
        ...s,
        is_hidden: hiddenIds.has(s.id),
        // Si existe overlay para este stage, usarlo como position efectiva
        position: overlayMap.has(s.id) ? overlayMap.get(s.id) : s.position,
      }))
      .sort((a: any, b: any) => (Number(a.position) - Number(b.position)));

    return new Response(JSON.stringify({ stages: result }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Internal server error", details: e?.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

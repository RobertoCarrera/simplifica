// @ts-nocheck
// =====================================================
// Edge Function: hide-stage
// =====================================================
// Gestiona ocultar/mostrar estados genéricos para empresas
// con validación robusta antes de escribir en hidden_stages
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Tipos de operación
type Operation = "hide" | "unhide";

// Configuración CORS
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

  // Manejar OPTIONS (preflight)
  if (req.method === "OPTIONS") {
    console.log("✅ CORS preflight request");
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Validar método
  if (req.method !== "POST") {
    console.warn(`⚠️ Method not allowed: ${req.method}`);
    return new Response(
      JSON.stringify({
        error: "Method not allowed",
        allowed: ["POST", "OPTIONS"],
      }),
      {
        status: 405,
        headers: corsHeaders,
      }
    );
  }

  // Validar Origin para POST
  if (!isOriginAllowed(origin)) {
    console.error(`❌ Origin not allowed: ${origin}`);
    return new Response(
      JSON.stringify({ error: "Origin not allowed" }),
      {
        status: 403,
        headers: corsHeaders,
      }
    );
  }

  try {
    // Extraer y validar JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("❌ Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization" }),
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Crear cliente Supabase con service_role (seguro en Edge Function)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    });

    // Verificar usuario autenticado
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error("❌ Invalid token:", userError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    console.log(`✅ Authenticated user: ${user.id}`);

    // Obtener id y company_id del usuario
    // Nota: La tabla 'users' usa 'auth_user_id' para relacionarse con auth.users
    // Necesitamos el 'id' de users (no auth_user_id) para hidden_by FK
    const { data: userData, error: companyError } = await supabaseAdmin
      .from("users")
      .select("id, company_id")
      .eq("auth_user_id", user.id)
      .single();

    if (companyError || !userData?.company_id) {
      console.error("❌ User has no company:", companyError?.message);
      return new Response(
        JSON.stringify({ 
          error: "User not associated with a company",
          details: companyError?.message 
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const userId = userData.id; // ID de la tabla users (para FK)
    const companyId = userData.company_id;
    console.log(`✅ User id: ${userId}, company_id: ${companyId}`);

    // Parsear body
    const body = await req.json();

    // Validar campos requeridos
    const REQUIRED_FIELDS = ["p_stage_id", "p_operation"];
    const OPTIONAL_FIELDS: string[] = [];
    const receivedKeys = Object.keys(body);

    const missingFields = REQUIRED_FIELDS.filter((field) => !receivedKeys.includes(field));

    if (missingFields.length > 0) {
      console.error(`❌ Missing required fields: ${missingFields.join(", ")}`);
      return new Response(
        JSON.stringify({
          error: `Missing required fields: ${missingFields.join(", ")}`,
          details: {
            required: REQUIRED_FIELDS,
            optional: OPTIONAL_FIELDS,
            received_keys: receivedKeys,
          },
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const stageId = body.p_stage_id;
    const operation: Operation = body.p_operation;

    // Validar operación
    if (operation !== "hide" && operation !== "unhide") {
      console.error(`❌ Invalid operation: ${operation}`);
      return new Response(
        JSON.stringify({
          error: "Invalid operation",
          details: {
            allowed: ["hide", "unhide"],
            received: operation,
          },
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    console.log(`🔄 Processing ${operation} for stage ${stageId}`);

    // VALIDACIÓN CRÍTICA: Verificar que el stage es genérico (company_id IS NULL)
    const { data: stageData, error: stageError } = await supabaseAdmin
      .from("ticket_stages")
      .select("id, company_id, name")
      .eq("id", stageId)
      .single();

    if (stageError || !stageData) {
      console.error(`❌ Stage not found: ${stageId}`, stageError?.message);
      return new Response(
        JSON.stringify({
          error: "Stage not found",
          stage_id: stageId,
        }),
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    if (stageData.company_id !== null) {
      console.error(`❌ Stage ${stageId} is not generic (company_id: ${stageData.company_id})`);
      return new Response(
        JSON.stringify({
          error: "Only generic stages (system-wide) can be hidden",
          stage_id: stageId,
          stage_name: stageData.name,
          is_generic: false,
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    console.log(`✅ Stage ${stageData.name} is generic`);

    // Ejecutar operación
    let result;

    if (operation === "hide") {
      // HIDE: Insertar en hidden_stages
      const { data, error } = await supabaseAdmin
        .from("hidden_stages")
        .insert({
          company_id: companyId,
          stage_id: stageId,
          hidden_by: userId, // Usar el ID de la tabla users (no auth_user_id)
        })
        .select()
        .single();

      if (error) {
        // Si ya existe (unique constraint), no es error crítico
        if (error.code === "23505") {
          console.log(`⚠️ Stage already hidden for company ${companyId}`);
          return new Response(
            JSON.stringify({
              result: {
                message: "Stage already hidden",
                stage_id: stageId,
                company_id: companyId,
              },
            }),
            {
              status: 200,
              headers: corsHeaders,
            }
          );
        }

        console.error("❌ Error hiding stage:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to hide stage",
            details: error.message,
          }),
          {
            status: 500,
            headers: corsHeaders,
          }
        );
      }

      result = data;
      console.log(`✅ Stage hidden successfully`);
    } else {
      // UNHIDE: Eliminar de hidden_stages
      const { data, error } = await supabaseAdmin
        .from("hidden_stages")
        .delete()
        .eq("company_id", companyId)
        .eq("stage_id", stageId)
        .select()
        .single();

      if (error) {
        // Si no existe, no es error crítico
        if (error.code === "PGRST116") {
          console.log(`⚠️ Stage was not hidden for company ${companyId}`);
          return new Response(
            JSON.stringify({
              result: {
                message: "Stage was not hidden",
                stage_id: stageId,
                company_id: companyId,
              },
            }),
            {
              status: 200,
              headers: corsHeaders,
            }
          );
        }

        console.error("❌ Error unhiding stage:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to unhide stage",
            details: error.message,
          }),
          {
            status: 500,
            headers: corsHeaders,
          }
        );
      }

      result = data;
      console.log(`✅ Stage unhidden successfully`);
    }

    // Respuesta exitosa
    return new Response(
      JSON.stringify({
        result: {
          operation,
          stage_id: stageId,
          stage_name: stageData.name,
          company_id: companyId,
          ...result,
        },
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});

// @ts-nocheck
// =====================================================
// Edge Function: get-company-filter-visibility
// =====================================================
// GET endpoint that returns all available booking portal filters
// annotated with their per-company visibility status.
//
// Two modes:
//   Authenticated (admin panel): Bearer token → derives company_id from user
//   Unauthenticated (public portal): ?company_id=<uuid> query param
//
// Response: { filters: [{ id, label, icon, sort_order, visible }] }
// Default: visible = true when no company_filter_visibility row exists.
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const urlObj = new URL(req.url);
    const qCompany = urlObj.searchParams.get("company_id");
    const authHeader = req.headers.get("authorization");

    let companyId: string | null = null;

    // Mode 1: Authenticated (admin panel) — derive company from token
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");

      const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 401,
          headers: corsHeaders,
        });
      }

      if (qCompany) {
        // Validate the user belongs to the requested company
        const { data: uRow, error: uErr } = await supabaseAdmin
          .from("users")
          .select("company_id")
          .eq("auth_user_id", user.id)
          .single();
        if (uErr || !uRow?.company_id || uRow.company_id !== qCompany) {
          return new Response(JSON.stringify({ error: "Forbidden company_id" }), {
            status: 403,
            headers: corsHeaders,
          });
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
    }
    // Mode 2: Unauthenticated (public portal) — use query param
    else if (qCompany) {
      // Validate the company exists (basic check, no auth needed for public access)
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(qCompany)) {
        return new Response(JSON.stringify({ error: "Invalid company_id format" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const { data: company, error: companyErr } = await supabaseAdmin
        .from("companies")
        .select("id")
        .eq("id", qCompany)
        .maybeSingle();

      if (companyErr || !company) {
        return new Response(JSON.stringify({ error: "Company not found" }), {
          status: 404,
          headers: corsHeaders,
        });
      }
      companyId = qCompany;
    } else {
      return new Response(JSON.stringify({
        error: "Missing company_id. Provide a Bearer token or ?company_id=<uuid> query parameter.",
      }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Fetch all filter definitions
    const { data: definitions, error: defsError } = await supabaseAdmin
      .from("filter_definitions")
      .select("id, label, icon, sort_order")
      .order("sort_order", { ascending: true });

    if (defsError) {
      console.error("[get-company-filter-visibility] Filter definitions error:", defsError.message);
      return new Response(JSON.stringify({ error: "Failed to load filter definitions" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Fetch visibility config for this company
    const { data: visibility, error: visError } = await supabaseAdmin
      .from("company_filter_visibility")
      .select("filter_id, visible")
      .eq("company_id", companyId);

    if (visError) {
      console.error("[get-company-filter-visibility] Visibility error:", visError.message);
      return new Response(JSON.stringify({ error: "Failed to load filter visibility" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Build visibility map: defaults to true when no row exists
    const visMap = new Map<string, boolean>();
    (visibility || []).forEach((v: any) => visMap.set(v.filter_id, v.visible));

    const filters = (definitions || []).map((d: any) => ({
      id: d.id,
      label: d.label,
      icon: d.icon,
      sort_order: d.sort_order,
      visible: visMap.has(d.id) ? visMap.get(d.id) : true,
    }));

    return new Response(JSON.stringify({ filters }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e: any) {
    console.error("[get-company-filter-visibility] Unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

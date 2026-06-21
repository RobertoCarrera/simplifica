// @ts-nocheck
// =====================================================
// Edge Function: update-company-filter-visibility
// =====================================================
// PUT endpoint to bulk update filter visibility for a company.
// Expects: { filters: [{ filter_id: string, visible: boolean }] }
//
// Authorization: only owner, super_admin, or admin of the company.
// Validates: at least one filter must remain visible.
// Performs: upsert into company_filter_visibility.
// Returns: { filters: [...] } (same shape as GET).
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limiter.ts";
import { getClientIP, withSecurityHeaders } from "../_shared/security.ts";

const ALLOW_ALL_ORIGINS = !(Deno.env.get("SUPABASE_URL") || "").startsWith("https://") && Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "PUT, OPTIONS",
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

  // Rate limiting: 20 req/min per IP
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`update-filter-vis:${ip}`, 20, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: withSecurityHeaders({ ...getCorsHeaders(origin), "Content-Type": "application/json", ...getRateLimitHeaders(rl) }),
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: withSecurityHeaders(corsHeaders) });
  }

  if (req.method !== "PUT") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use PUT." }), {
      status: 405,
      headers: withSecurityHeaders(corsHeaders),
    });
  }

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: withSecurityHeaders(corsHeaders),
    });
  }

  try {
    // Auth required
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid authorization" }), {
        status: 401,
        headers: withSecurityHeaders(corsHeaders),
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Validate user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    // Parse body
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.filters)) {
      return new Response(JSON.stringify({
        error: "filters (array) is required. Example: { filters: [{ filter_id: 'services', visible: true }] }",
      }), {
        status: 400,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    const inputFilters: Array<{ filter_id: string; visible: boolean }> = body.filters;
    if (inputFilters.length === 0) {
      return new Response(JSON.stringify({ error: "filters array cannot be empty" }), {
        status: 400,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    // Resolve user and company
    const { data: userRow, error: uErr } = await supabaseAdmin
      .from("users")
      .select("id, company_id, app_role:app_roles(name)")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (uErr || !userRow?.company_id) {
      return new Response(JSON.stringify({ error: "User not associated with a company" }), {
        status: 400,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    const userId = userRow.id;
    const companyId = userRow.company_id;
    const roleName = userRow.app_role?.name;

    // Authorization: only owner, super_admin, admin
    if (!["owner", "super_admin", "admin"].includes(roleName)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions. Requires admin, owner, or super_admin." }), {
        status: 403,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    // Validate at least one filter remains visible
    const visibleCount = inputFilters.filter((f: any) => f.visible).length;
    if (visibleCount === 0) {
      return new Response(JSON.stringify({
        error: "Al menos un filtro debe estar activo",
        code: "MINIMUM_ONE_VISIBLE",
      }), {
        status: 400,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    // Validate all filter_ids exist
    const filterIds = inputFilters.map((f: any) => f.filter_id);
    const { data: existingDefs, error: defsErr } = await supabaseAdmin
      .from("filter_definitions")
      .select("id")
      .in("id", filterIds);

    if (defsErr) {
      return new Response(JSON.stringify({ error: "Failed to validate filter IDs" }), {
        status: 500,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    const existingIds = new Set((existingDefs || []).map((d: any) => d.id));
    const unknownIds = filterIds.filter((id: string) => !existingIds.has(id));
    if (unknownIds.length > 0) {
      return new Response(JSON.stringify({
        error: `Unknown filter IDs: ${unknownIds.join(", ")}`,
        code: "UNKNOWN_FILTER",
      }), {
        status: 400,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    // Bulk upsert
    const rows = inputFilters.map((f: any) => ({
      company_id: companyId,
      filter_id: f.filter_id,
      visible: f.visible,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabaseAdmin
      .from("company_filter_visibility")
      .upsert(rows, { onConflict: "company_id,filter_id" });

    if (upsertErr) {
      console.error("[update-company-filter-visibility] Upsert error:", upsertErr);
      return new Response(JSON.stringify({ error: "Failed to update filter visibility" }), {
        status: 500,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    // Return updated filters (same shape as GET)
    const { data: definitions } = await supabaseAdmin
      .from("filter_definitions")
      .select("id, label, icon, sort_order")
      .order("sort_order", { ascending: true });

    const { data: visibility } = await supabaseAdmin
      .from("company_filter_visibility")
      .select("filter_id, visible")
      .eq("company_id", companyId);

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
      headers: withSecurityHeaders(corsHeaders),
    });
  } catch (e: any) {
    console.error("[update-company-filter-visibility] Unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: withSecurityHeaders(corsHeaders),
    });
  }
});

// @ts-nocheck
// ==============================================
// Edge Function: get-effective-modules
// ==============================================
// Devuelve la lista de módulos con su estado efectivo
// para el usuario autenticado. Reglas:
// - client: hereda los módulos del owner de su empresa
// - owner/admin/member: usa sus propios módulos asignados
// Los metadatos vienen de la tabla 'modules_catalog'.
// Por defecto, todos los módulos están activados si no hay
// entrada en user_modules (seedeado en desactivado).
// ==============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';


const ALLOW_ALL_ORIGINS = !(Deno.env.get("SUPABASE_URL") || "").startsWith("https://") && Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
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

  // Rate limiting FIRST (before CORS preflight) — Rafter v0.22 F-02 fix
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`get-effective-modules:${ip}`, 60, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) }),
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: withSecurityHeaders(corsHeaders) });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
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
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid authorization" }), {
        status: 401,
        headers: withSecurityHeaders(corsHeaders),
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Auth user
    const {
      data: { user },
      error: userErr,
    } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    // Resolve app user row
    const { data: me, error: meErr } = await supabaseAdmin
      .from("users")
      .select("id, company_id, app_role:app_roles(name), active")
      .eq("auth_user_id", user.id)
      .single();

    if (meErr || !me?.company_id || me.active === false) {
      return new Response(JSON.stringify({ error: "User not associated/active" }), { status: 400, headers: withSecurityHeaders(corsHeaders) });
    }

    const myRole = me.app_role?.name;

    // Determine effective user for module inheritance
    let effectiveUserId = me.id;
    if (myRole === "client") {
      // Find active owner of same company
      const { data: owner, error: ownerErr } = await supabaseAdmin
        .from("users")
        .select("id, app_roles!inner(name)")
        .eq("company_id", me.company_id)
        .eq("app_roles.name", "owner")
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      if (!ownerErr && owner?.id) {
        effectiveUserId = owner.id;
      }
    }

    // Fetch modules catalog
    const { data: modulesCatalog, error: modErr } = await supabaseAdmin
      .from("modules_catalog")
      .select("key, label")
      .order("key", { ascending: true })
      .limit(500);
    if (modErr) {
      console.error('[get-effective-modules] Modules catalog error:', modErr.message);
      return new Response(JSON.stringify({ error: 'Failed to load modules' }), { status: 500, headers: withSecurityHeaders(corsHeaders) });
    }

    // Fetch assignments for effective user
    const { data: userMods, error: umErr } = await supabaseAdmin
      .from("user_modules")
      .select("module_key,status")
      .eq("user_id", effectiveUserId);
    if (umErr) {
      console.error('[get-effective-modules] User modules error:', umErr.message);
      return new Response(JSON.stringify({ error: 'Failed to load user modules' }), { status: 500, headers: withSecurityHeaders(corsHeaders) });
    }

    // Fetch company modules for fallback
    const { data: companyMods, error: cmErr } = await supabaseAdmin
      .from("company_modules")
      .select("module_key,status")
      .eq("company_id", me.company_id);
    if (cmErr) {
      console.error('[get-effective-modules] Company modules error:', cmErr.message);
      return new Response(JSON.stringify({ error: 'Failed to load company modules' }), { status: 500, headers: withSecurityHeaders(corsHeaders) });
    }

    const userStatusMap = new Map<string, string>((userMods || []).map((m: any) => [m.module_key, (m.status || '').toLowerCase()]));
    const companyStatusMap = new Map<string, string>((companyMods || []).map((m: any) => [m.module_key, (m.status || '').toLowerCase()]));

    const result = (modulesCatalog || []).map((m: any) => {
      const userRaw = userStatusMap.get(m.key);
      const companyRaw = companyStatusMap.get(m.key);
      // User module takes precedence if explicitly active; otherwise fallback to company module
      const userEnabled = !!userRaw && (userRaw === "activado" || userRaw === "active" || userRaw === "enabled");
      const companyEnabled = !!companyRaw && (companyRaw === "activado" || companyRaw === "active");
      const enabled = userEnabled || companyEnabled;
      return {
        key: m.key,
        name: m.label,
        enabled,
      };
    });

    return new Response(JSON.stringify({ modules: result }), { status: 200, headers: withSecurityHeaders(corsHeaders) });
  } catch (e: any) {
    console.error('[get-effective-modules] Unhandled error:', e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: withSecurityHeaders({ "Content-Type": "application/json", ...getCorsHeaders(req.headers.get("origin")) }),
    });
  }
});

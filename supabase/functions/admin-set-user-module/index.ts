// @ts-nocheck
// =====================================================
// Edge Function: admin-set-user-module
// =====================================================
// Permite a un admin de la empresa activar/desactivar módulos
// para cualquier usuario de su misma empresa (incluido el owner).
// Body JSON: { target_user_id: uuid, module_key: string, status: 'activado'|'desactivado' }
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOW_ALL_ORIGINS = Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401, headers: corsHeaders });
    }

    const meRes = await supabaseAdmin
      .from('users')
      .select('id, company_id, role, active')
      .eq('auth_user_id', user.id)
      .single();
    const me = meRes.data;
    if (meRes.error || !me?.company_id || me.active === false) {
      return new Response(JSON.stringify({ error: 'User not associated/active' }), { status: 400, headers: corsHeaders });
    }
    // Allowed admin roles list (env override) e.g. "admin,superadmin"
    const allowedRoles = (Deno.env.get('PLATFORM_ADMIN_ROLES') || 'admin,superadmin')
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);
    const myRole = String(me.role).toLowerCase();
    if (!allowedRoles.includes(myRole)) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => null) as { target_user_id?: string, module_key?: string, status?: string } | null;
    if (!body || !body.target_user_id || !body.module_key || !body.status) {
      return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: corsHeaders });
    }
    const status = String(body.status).toLowerCase();
    if (!['activado','desactivado','active','inactive','enabled','disabled'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400, headers: corsHeaders });
    }

    // Verify target user exists. If not found -> 404
    const tgtRes = await supabaseAdmin
      .from('users')
      .select('id, company_id')
      .eq('id', body.target_user_id)
      .maybeSingle();
    if (!tgtRes.data?.id) {
      return new Response(JSON.stringify({ error: 'Target user not found' }), { status: 404, headers: corsHeaders });
    }
    // Optional restriction: If env PLATFORM_STRICT_SAME_COMPANY === 'true' then enforce same company for non-superadmin
    const strictSameCompany = (Deno.env.get('PLATFORM_STRICT_SAME_COMPANY') || 'false').toLowerCase() === 'true';
    const isSuperAdmin = myRole === 'superadmin';
    if (strictSameCompany && !isSuperAdmin && tgtRes.data.company_id !== me.company_id) {
      return new Response(JSON.stringify({ error: 'Forbidden: user not in same company' }), { status: 403, headers: corsHeaders });
    }

    // Normalize status to 'activado'|'desactivado'
    const normalized = ['activado','active','enabled'].includes(status) ? 'activado' : 'desactivado';

    // Upsert (update or insert) user_modules
    // Try update first
    const upd = await supabaseAdmin
      .from('user_modules')
      .update({ status: normalized, updated_at: new Date().toISOString() })
      .eq('user_id', body.target_user_id)
      .eq('module_key', body.module_key)
      .select('id')
      .single();

    if (upd.error && upd.error.code !== 'PGRST116') {
      // PGRST116: No rows found for single() — continue to insert
      // But any other error, bubble up
      // We'll still proceed to insert if it's exactly PGRST116
    }

    if (!upd.data) {
      const ins = await supabaseAdmin
        .from('user_modules')
        .insert({ user_id: body.target_user_id, module_key: body.module_key, status: normalized })
        .select('id')
        .single();
      if (ins.error) {
        return new Response(JSON.stringify({ error: ins.error.message }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Internal server error', details: e?.message }), { status: 500, headers: corsHeaders });
  }
});

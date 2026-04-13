// @ts-nocheck
// =====================================================
// Edge Function: delete-stage-safe
// =====================================================
// Safely deletes a company-specific ticket stage by:
// - Requiring reassignment if tickets reference the stage (409 REASSIGN_REQUIRED)
// - Enforcing category coverage (maps DB exception to 409 COVERAGE_BREAK)
// - Delegating the actual logic to SQL function safe_delete_ticket_stage
// Includes robust CORS handling.
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS config via env
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed", allowed: ["POST", "OPTIONS"] }), { status: 405, headers: corsHeaders });
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
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: corsHeaders });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // Resolve user and company
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401, headers: corsHeaders });
    }
    const { data: uRow, error: uErr } = await admin
      .from('users')
      .select('id, company_id, app_role:app_roles(name)')
      .eq('auth_user_id', user.id)
      .single();
    if (uErr || !uRow?.company_id) {
      return new Response(JSON.stringify({ error: "User not associated with a company" }), { status: 400, headers: corsHeaders });
    }
    const companyId = uRow.company_id as string;

    // Only admin/owner can delete stages
    const roleName = uRow.app_role?.name;
    if (!['admin', 'owner', 'super_admin'].includes(roleName)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const p_stage_id: string | undefined = body?.p_stage_id;
    const p_reassign_to: string | undefined = body?.p_reassign_to;
    if (!p_stage_id) {
      return new Response(JSON.stringify({ error: "Missing required field p_stage_id" }), { status: 400, headers: corsHeaders });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(p_stage_id) || (p_reassign_to && !uuidRegex.test(p_reassign_to))) {
      return new Response(JSON.stringify({ error: "Invalid stage ID format" }), { status: 400, headers: corsHeaders });
    }

    // Quick pre-check: if no reassignment provided and tickets reference the stage, return 409
    if (!p_reassign_to) {
      const { count: refCount, error: cErr } = await admin
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('stage_id', p_stage_id);
      if (!cErr && (refCount || 0) > 0) {
        return new Response(JSON.stringify({
          error: 'Tickets reference this stage; reassignment required before delete',
          code: 'REASSIGN_REQUIRED',
          stage_id: p_stage_id,
          tickets_count: refCount
        }), { status: 409, headers: corsHeaders });
      }
    }

    // Delegate to SQL function, which enforces coverage and performs the delete
    const { data, error } = await admin.rpc('safe_delete_ticket_stage', {
      p_stage_id,
      p_company_id: companyId,
      p_reassign_to: p_reassign_to || null
    });

    if (error) {
      const msg = (error.message || '').toString();
      if (msg.includes('Could not find the function') || msg.includes('schema cache')) {
        console.error('[delete-stage-safe] RPC function missing:', msg);
        return new Response(
          JSON.stringify({ error: 'Database configuration error', code: 'FUNCTION_MISSING' }),
          { status: 500, headers: corsHeaders }
        );
      }
      // If we hit an operator/type error, surface as syntax error (not coverage)
      if (/operator does not exist|cannot cast|invalid input value for enum/i.test(msg)) {
        console.error('[delete-stage-safe] SQL error:', msg);
        return new Response(JSON.stringify({ error: 'Error processing stage deletion', code: 'SYNTAX_ERROR' }), { status: 400, headers: corsHeaders });
      }
      // Map known conditions to 409
      if (msg.includes('Debe existir al menos') || msg.toLowerCase().includes('coverage') || msg.toLowerCase().includes('categor')) {
        return new Response(JSON.stringify({ error: 'Deleting would break category coverage', code: 'COVERAGE_BREAK' }), { status: 409, headers: corsHeaders });
      }
      if (msg.toLowerCase().includes('referenc') || msg.toLowerCase().includes('reassign')) {
        return new Response(JSON.stringify({ error: 'Tickets reference this stage; reassignment required', code: 'REASSIGN_REQUIRED' }), { status: 409, headers: corsHeaders });
      }
      console.error('[delete-stage-safe] delete error:', msg);
      return new Response(JSON.stringify({ error: 'Failed to delete stage' }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ result: data || { deleted: true, stageId: p_stage_id, companyId } }), { status: 200, headers: corsHeaders });
  } catch (e: any) {
    console.error('[delete-stage-safe] Internal error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: corsHeaders });
  }
});

// @ts-nocheck
// =====================================================
// Edge Function: delete-stage-safe
// =====================================================
// Safely deletes a ticket stage avoiding FK conflicts by optionally
// reassigning existing tickets to another stage in the same company.
//
// Input (JSON):
//   - p_stage_id: uuid (required)
//   - p_reassign_to: uuid (optional) // if provided, tickets will be moved there
//
// Auth: Bearer <JWT> required. The function resolves the caller's company
// by reading public.users.company_id via service role and validates the
// stage belongs to this company before deletion.
//
// CORS: Controlled by env ALLOW_ALL_ORIGINS, ALLOWED_ORIGINS
// =====================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNCTION_NAME = 'delete-stage-safe';
const FUNCTION_VERSION = '2025-10-19-1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s=>s.trim()).filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars`);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function corsHeaders(origin?: string) {
  const h = new Headers();
  h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (ALLOW_ALL_ORIGINS) {
    h.set('Access-Control-Allow-Origin', origin || '*');
  } else {
    const ok = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '';
    if (ok) h.set('Access-Control-Allow-Origin', ok);
  }
  h.set('Content-Type', 'application/json');
  h.set('X-Function-Name', FUNCTION_NAME);
  h.set('X-Function-Version', FUNCTION_VERSION);
  return h;
}

function isOriginAllowed(origin?: string) {
  if (!origin) return true; // server-to-server
  if (ALLOW_ALL_ORIGINS) return true;
  if (ALLOWED_ORIGINS.length === 0) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

serve(async (req) => {
  const origin = req.headers.get('origin') || req.headers.get('Origin') || undefined;
  const headers = corsHeaders(origin);

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] }), { status: 405, headers });
  }

  if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers });
  }

  // Auth
  const authHeader = req.headers.get('authorization') || '';
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401, headers });
  }
  const token = m[1];

  let authUserId: string | null = null;
  try {
    const u = await supabaseAdmin.auth.getUser(token);
    if (u.error || !u.data?.user) {
      return new Response(JSON.stringify({ error: 'Invalid token', details: u.error?.message }), { status: 401, headers });
    }
    authUserId = u.data.user.id;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Auth check failed', details: String(e) }), { status: 401, headers });
  }

  // Resolve company from users table
  let companyId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('company_id')
      .eq('auth_user_id', authUserId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    companyId = data?.company_id || null;
    if (!companyId) {
      return new Response(JSON.stringify({ error: 'User has no company_id' }), { status: 403, headers });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to resolve company', details: String(e) }), { status: 500, headers });
  }

  // Parse input
  let body: any;
  try {
    body = await req.json();
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
  }
  const keys = Object.keys(body || {});
  const invalid = keys.filter(k => !k.startsWith('p_'));
  if (invalid.length) {
    return new Response(JSON.stringify({ error: 'Only p_* keys are allowed', invalid }), { status: 400, headers });
  }

  const p_stage_id = body?.p_stage_id as string | undefined;
  const p_reassign_to = (body?.p_reassign_to as string | undefined) || null;
  if (!p_stage_id) {
    return new Response(JSON.stringify({ error: 'p_stage_id is required' }), { status: 400, headers });
  }

  // Optional: quick validation that the stage belongs to the same company
  try {
    const { data: s, error: e1 } = await supabaseAdmin
      .from('ticket_stages')
      .select('id, company_id')
      .eq('id', p_stage_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (e1) throw e1;
    if (!s) return new Response(JSON.stringify({ error: 'Stage not found' }), { status: 404, headers });
    if (s.company_id !== companyId) {
      return new Response(JSON.stringify({ error: 'Stage does not belong to your company' }), { status: 403, headers });
    }
    if (p_reassign_to) {
      const { data: s2, error: e2 } = await supabaseAdmin
        .from('ticket_stages')
        .select('id, company_id')
        .eq('id', p_reassign_to)
        .is('deleted_at', null)
        .maybeSingle();
      if (e2) throw e2;
      if (!s2) return new Response(JSON.stringify({ error: 'Reassign stage not found' }), { status: 404, headers });
      if (s2.company_id !== companyId) {
        return new Response(JSON.stringify({ error: 'Reassign stage belongs to another company' }), { status: 403, headers });
      }
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Validation failed', details: String(e) }), { status: 400, headers });
  }

  // Call SQL function
  try {
    const { data, error } = await supabaseAdmin
      .rpc('safe_delete_ticket_stage', { p_stage_id, p_company_id: companyId, p_reassign_to });
    if (error) {
      // Bubble meaningful DB messages to client with 409 when FK conflict-like behavior
      const msg = (error as any)?.message || String(error);
      const status = /referenced|tickets|reassign/i.test(msg) ? 409 : 400;
      return new Response(JSON.stringify({ error: 'Delete failed', details: msg }), { status, headers });
    }
    return new Response(JSON.stringify({ ok: true, result: data }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Unexpected error', details: String(e) }), { status: 500, headers });
  }
});

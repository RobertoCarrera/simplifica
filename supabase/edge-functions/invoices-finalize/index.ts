// @ts-nocheck
// Edge Function: invoices-finalize
// Purpose: finalize invoice -> assign series/number, compute hash chain, enqueue event
// Auth: Bearer JWT required; company_id must be in JWT claims (or derived by RPC if needed)
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOW_ALL_ORIGINS/ALLOWED_ORIGINS
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(origin?: string) {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map(s=>s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : allowAll ? "*" : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  } as Record<string,string>;
}

serve(async (req) => {
  const origin = req.headers.get("Origin") || undefined;
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing Bearer token" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { invoice_id, series, device_id, software_id } = await req.json();
    if (!invoice_id || !series) {
      return new Response(JSON.stringify({ error: "invoice_id and series are required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Decode JWT and map auth user -> company
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid user token' }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const authUserId = authData.user.id;

    const { data: profile, error: profErr } = await admin
      .from('users')
      .select('id, company_id, active')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (profErr || !profile?.company_id || profile.active === false) {
      return new Response(JSON.stringify({ error: 'Forbidden: user has no active company' }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const userCompanyId = profile.company_id;

    // Load invoice and ensure it belongs to user's company
    const { data: inv, error: invErr } = await admin
      .from('invoices')
      .select('id, company_id, state, full_invoice_number, series_id')
      .eq('id', invoice_id)
      .maybeSingle();
    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (inv.company_id !== userCompanyId) {
      return new Response(JSON.stringify({ error: 'Forbidden: invoice belongs to another company' }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Call RPC finalize_invoice (execute with service role to access verifactu schema)
    const { data, error } = await admin.rpc('finalize_invoice', { p_invoice_id: invoice_id, p_series: series, p_device_id: device_id ?? null, p_software_id: software_id ?? null });
    if (error) {
      return new Response(JSON.stringify({ error: error.message, details: error }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, meta: data }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

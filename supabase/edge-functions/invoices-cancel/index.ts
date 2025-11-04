// @ts-nocheck
// Edge Function: invoices-cancel
// Purpose: cancel invoice (AEAT annulment lifecycle hook). Updates invoice state and enqueues verifactu event via RPC.
// Auth: Bearer JWT required
// RPC used: public.cancel_invoice(p_invoice_id uuid, p_reason text default null)
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOW_ALL_ORIGINS/ALLOWED_ORIGINS

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS')||'false').toLowerCase()==='true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  const allowOrigin = isAllowed && origin ? origin : (allowAll ? '*' : '');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  } as Record<string,string>;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = { ...cors(origin), 'Content-Type':'application/json' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status:405, headers });

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
    if (!token) return new Response(JSON.stringify({ error:'Missing Bearer token'}), { status:401, headers });

    const { invoice_id, reason } = await req.json();
    if (!invoice_id) return new Response(JSON.stringify({ error: 'invoice_id is required' }), { status:400, headers });

    const url = Deno.env.get('SUPABASE_URL')||'';
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    if (!url || !service) return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status:500, headers });

    const admin = createClient(url, service, { auth: { persistSession: false } });

    // Decode JWT and map user -> company
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid user token' }), { status: 401, headers });
    }
    const authUserId = authData.user.id;

    const { data: profile, error: profErr } = await admin
      .from('users')
      .select('id, company_id, active')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (profErr || !profile?.company_id || profile.active === false) {
      return new Response(JSON.stringify({ error: 'Forbidden: user has no active company' }), { status: 403, headers });
    }
    const userCompanyId = profile.company_id;

    // Ensure invoice exists (optional RLS-independent check)
    const { data: inv, error: invErr } = await admin
      .from('invoices')
      .select('id, state, full_invoice_number, company_id')
      .eq('id', invoice_id)
      .maybeSingle();
    if (invErr || !inv) return new Response(JSON.stringify({ error:'Invoice not found' }), { status:404, headers });

    // Authorization: invoice must belong to the user's company
    if (inv.company_id !== userCompanyId) {
      return new Response(JSON.stringify({ error: 'Forbidden: invoice belongs to another company' }), { status: 403, headers });
    }

    // Call cancel RPC (idempotent by design: sets state void and enqueues event)
  // Execute as service role to ensure access to verifactu schema within the RPC
  const { data, error } = await admin.rpc('cancel_invoice', { p_invoice_id: invoice_id, p_reason: reason ?? null });
    if (error) return new Response(JSON.stringify({ error: error.message || 'Cancel failed', details: error }), { status:400, headers });

    return new Response(JSON.stringify({ ok:true, result: data ?? { status:'void' } }), { status:200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers });
  }
});

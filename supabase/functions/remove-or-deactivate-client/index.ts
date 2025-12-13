// @ts-nocheck
// Edge Function: remove-or-deactivate-client
// Purpose: Conditionally HARD DELETE a client (lead) when it has no invoices
//          or DEACTIVATE (soft-retention) when it has one or more invoices.
// Rules:
//   - If invoice count (non-cancelled, non-deleted) > 0 => set is_active = false and retain row
//   - Else => physical DELETE FROM clients
//   - Always scoped to authenticated user's company_id (resolved via users table)
//   - Returns JSON: { ok:true, action:'deleted'|'deactivated', invoiceCount, clientId, quoteCount, ticketCount }
// Security:
//   - Requires Authorization: Bearer <JWT>
//   - Validates origin against ALLOW_ALL_ORIGINS / ALLOWED_ORIGINS
//   - Rate limited (simple in-memory per-IP)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ===== Rate Limiter (simple) =====
interface RL { count:number; resetAt:number }
const rlMap = new Map<string, RL>();
function checkRl(ip:string, limit=60, windowMs=60_000){
  const now = Date.now();
  const k = `rmordel:${ip}`;
  let e = rlMap.get(k);
  if (!e || e.resetAt < now){ e = { count:0, resetAt: now + windowMs }; rlMap.set(k,e); }
  e.count++;
  return { allowed: e.count <= limit, remaining: Math.max(0, limit - e.count), resetAt: e.resetAt, limit };
}

const FN_NAME = 'remove-or-deactivate-client';
const FN_VERSION = '2025-11-08-initial';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS')||'false').toLowerCase()==='true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);

if (!SUPABASE_URL || !SERVICE_KEY){
  console.error(`[${FN_NAME}] Missing required env vars SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
}

function corsHeaders(origin?: string){
  const h = new Headers();
  h.set('Vary','Origin');
  h.set('Access-Control-Allow-Headers','authorization, x-client-info, apikey, content-type');
  h.set('Access-Control-Allow-Methods','POST, OPTIONS');
  if (ALLOW_ALL_ORIGINS){
    h.set('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h.set('Access-Control-Allow-Origin', origin);
  }
  h.set('Content-Type','application/json');
  h.set('X-Function-Name', FN_NAME);
  h.set('X-Function-Version', FN_VERSION);
  return h;
}

function originAllowed(origin?: string){
  if (!origin) return true; // server-side
  if (ALLOW_ALL_ORIGINS) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || req.headers.get('origin') || undefined;
  const headers = corsHeaders(origin);

  // Preflight
  if (req.method === 'OPTIONS') {
    if (!originAllowed(origin)) return new Response(JSON.stringify({ error:'Origin not allowed' }), { status: 403, headers });
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error:'Method not allowed', allowed:['POST','OPTIONS']}), { status:405, headers });
  }
  if (!originAllowed(origin)) {
    return new Response(JSON.stringify({ error:'Origin not allowed'}), { status:403, headers });
  }

  // Rate limit
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const rl = checkRl(ip);
  headers.set('X-RateLimit-Limit', rl.limit.toString());
  headers.set('X-RateLimit-Remaining', rl.remaining.toString());
  headers.set('X-RateLimit-Reset', new Date(rl.resetAt).toISOString());
  if (!rl.allowed){
    return new Response(JSON.stringify({ error:'Rate limit exceeded', retryAfter: Math.ceil((rl.resetAt - Date.now())/1000)}), { status:429, headers });
  }

  try {
    // Auth
    const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const token = (auth.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!token){
      return new Response(JSON.stringify({ error:'Missing Authorization Bearer token'}), { status:401, headers });
    }
    const supabaseUser = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: authUser, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !authUser?.user){
      return new Response(JSON.stringify({ error:'Invalid token'}), { status:401, headers });
    }

    // Resolve company
    let companyId: string | null = null;
    try {
      const { data: urow, error: uerr } = await supabaseUser.from('users').select('company_id').eq('auth_user_id', authUser.user.id).limit(1).maybeSingle();
      if (!uerr && urow?.company_id) companyId = urow.company_id;
    } catch(e){ console.error(`[${FN_NAME}] company resolve error`, e); }
    if (!companyId){
      return new Response(JSON.stringify({ error:'Unable to resolve company for user'}), { status:403, headers });
    }

    // Body
    const body = await req.json().catch(()=>({}));
    const clientId = body?.p_id || body?.client_id || body?.id;
    if (!clientId){
      return new Response(JSON.stringify({ error:'Missing required field p_id'}), { status:400, headers });
    }

    // Fetch client & verify ownership
    const { data: clientRow, error: clientErr } = await supabaseUser.from('clients').select('id, company_id, metadata').eq('id', clientId).limit(1).maybeSingle();
    if (clientErr) {
      return new Response(JSON.stringify({ error:'DB error fetching client', details: clientErr.message || clientErr }), { status:500, headers });
    }
    if (!clientRow){
      return new Response(JSON.stringify({ error:'Client not found'}), { status:404, headers });
    }
    if (clientRow.company_id !== companyId){
      return new Response(JSON.stringify({ error:'Not allowed to remove client from another company'}), { status:403, headers });
    }

    // Count invoices (active: not cancelled, not deleted)
    const { count: invoiceCount, error: invErr } = await supabaseUser
      .from('invoices')
      .select('id', { count:'exact', head:true })
      .eq('client_id', clientId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .not('status','eq','cancelled');
    if (invErr){
      return new Response(JSON.stringify({ error:'Failed counting invoices', details: invErr.message || invErr }), { status:500, headers });
    }

    // Optional counts (informational only)
    const [{ count: quoteCount }, { count: ticketCount }] = await Promise.all([
      supabaseUser.from('quotes').select('id', { count:'exact', head:true }).eq('client_id', clientId).eq('company_id', companyId),
      supabaseUser.from('tickets').select('id', { count:'exact', head:true }).eq('client_id', clientId).eq('company_id', companyId).is('deleted_at', null)
    ]).catch(()=>[{count:0},{count:0}]);

    let action: 'deleted' | 'deactivated';
    if ((invoiceCount || 0) > 0){
      // Deactivate (retain row)
      const retentionMeta = {
        retention_invoice_count: invoiceCount,
        retention_last_action: 'deactivated',
        retention_action_at: new Date().toISOString(),
        retention_reason: 'invoices_present'
      };
      // Merge metadata if existing
      let mergedMeta: any = {}; try { mergedMeta = typeof clientRow.metadata === 'object' && clientRow.metadata ? { ...clientRow.metadata } : {}; } catch {_}
      mergedMeta = { ...mergedMeta, ...retentionMeta };
      const { error: updErr } = await supabaseUser
        .from('clients')
        .update({ is_active: false, metadata: mergedMeta, updated_at: new Date().toISOString() })
        .eq('id', clientId)
        .eq('company_id', companyId);
      if (updErr){
        return new Response(JSON.stringify({ error:'Failed to deactivate client', details: updErr.message || updErr }), { status:500, headers });
      }
      action = 'deactivated';
    } else {
      // Physical delete (lead without invoices)
      // 1) Delete dependent quotes (items cascade)
      const { error: delQuotesErr } = await supabaseUser
        .from('quotes')
        .delete()
        .eq('client_id', clientId)
        .eq('company_id', companyId);
      if (delQuotesErr && String(delQuotesErr?.message || '').toLowerCase().indexOf('does not exist') === -1){
        return new Response(JSON.stringify({ error:'Failed to delete related quotes', details: delQuotesErr.message || delQuotesErr }), { status:500, headers });
      }
      // 2) Delete dependent tickets if table exists
      try {
        const { error: delTicketsErr } = await supabaseUser
          .from('tickets')
          .delete()
          .eq('client_id', clientId)
          .eq('company_id', companyId);
        if (delTicketsErr && String(delTicketsErr?.message || '').toLowerCase().indexOf('does not exist') === -1){
          return new Response(JSON.stringify({ error:'Failed to delete related tickets', details: delTicketsErr.message || delTicketsErr }), { status:500, headers });
        }
      } catch(_) { /* ignore if relation not present */ }

      // 3) Delete client
      const { error: delErr } = await supabaseUser
        .from('clients')
        .delete()
        .eq('id', clientId)
        .eq('company_id', companyId);
      if (delErr){
        return new Response(JSON.stringify({ error:'Failed to delete client', details: delErr.message || delErr }), { status:500, headers });
      }
      action = 'deleted';
    }

    return new Response(JSON.stringify({ ok:true, action, invoiceCount: invoiceCount || 0, quoteCount: quoteCount || 0, ticketCount: ticketCount || 0, clientId }), { status:200, headers });
  } catch (e){
    console.error(`[${FN_NAME}] Unexpected error`, e);
    return new Response(JSON.stringify({ error:'Internal error', details: String(e) }), { status:500, headers: corsHeaders(undefined) });
  }
});

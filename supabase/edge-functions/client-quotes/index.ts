// @ts-nocheck
// Edge Function: client-quotes
// Returns quotes visible to the authenticated client user, enforcing mapping
// via client_portal_users (company_id + email -> client_id). If mapping is
// missing, it will attempt a safe fallback by matching clients.email.
// Auth: Requires Bearer token; only role 'client' users are allowed.

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
  'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  } as Record<string,string>;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET' && req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status:405, headers:{...headers,'Content-Type':'application/json'}});

  try{
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
    if (!token) return new Response(JSON.stringify({ error:'Missing Bearer token'}), { status:401, headers:{...headers,'Content-Type':'application/json'}});

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')||'';
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')||'';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error:'Supabase not configured' }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
    }

    // RLS-scoped client with user token to read app user profile safely
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false }});
    const { data: appUser, error: uErr } = await userClient
      .from('users')
      .select('id, email, role, company_id')
      .single();
    if (uErr || !appUser) return new Response(JSON.stringify({ error:'User profile not found' }), { status:403, headers:{...headers,'Content-Type':'application/json'}});

    if (appUser.role !== 'client') {
      return new Response(JSON.stringify({ error:'Forbidden: only client users' }), { status:403, headers:{...headers,'Content-Type':'application/json'}});
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false }});

    // Resolve client_id mapping
    let clientId: string | null = null;
    {
      const { data: mapRow } = await admin
        .from('client_portal_users')
        .select('client_id, is_active')
        .eq('company_id', appUser.company_id)
        .eq('email', (appUser.email||'').toLowerCase())
        .eq('is_active', true)
        .maybeSingle();
      if (mapRow && (mapRow as any).client_id) clientId = (mapRow as any).client_id as string;
    }

    // Fallback by clients.email
    if (!clientId) {
      const { data: c } = await admin
        .from('clients')
        .select('id')
        .eq('company_id', appUser.company_id)
        .eq('email', (appUser.email||'').toLowerCase())
        .maybeSingle();
      if (c?.id) clientId = c.id as string;
    }

    if (!clientId) {
      return new Response(JSON.stringify({ data: [] }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
    }

    // If an id was provided, return the detailed quote (with items) for that client
    let requestedId: string | null = null;
    try {
      if (req.method === 'GET') {
        const u = new URL(req.url);
        requestedId = u.searchParams.get('id');
      } else if (req.method === 'POST') {
        const body = await req.json().catch(()=>({}));
        if (body && typeof body.id === 'string') requestedId = body.id;
      }
    } catch(_) {}

    if (requestedId) {
      const { data, error } = await admin
        .from('quotes')
        .select('id, company_id, client_id, full_quote_number, title, status, quote_date, valid_until, total_amount, currency, items:quote_items(id,line_number,description,quantity,unit_price,tax_rate,total)')
        .eq('company_id', appUser.company_id)
        .eq('client_id', clientId)
        .eq('id', requestedId)
        .single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
      return new Response(JSON.stringify({ data }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
    }

    // Otherwise list all quotes for the client
    const { data, error } = await admin
      .from('quotes')
      .select('id, company_id, client_id, full_quote_number, title, status, quote_date, valid_until, total_amount')
      .eq('company_id', appUser.company_id)
      .eq('client_id', clientId)
      .order('quote_date', { ascending: false });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    return new Response(JSON.stringify({ data: data || [] }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
  }
});

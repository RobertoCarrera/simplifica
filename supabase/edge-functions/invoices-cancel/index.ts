// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(origin?: string) {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map(s=>s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  return {"Access-Control-Allow-Origin": isAllowed && origin ? origin : allowAll ? "*" : "","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"} as Record<string,string>;
}

serve(async (req)=>{
  const origin = req.headers.get("Origin") || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...headers, 'Content-Type': 'application/json' } });

  try{
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
    if (!token) return new Response(JSON.stringify({ error:'Missing Bearer token'}), { status:401, headers:{...headers,'Content-Type':'application/json'}});

    const { invoice_id, reason } = await req.json();
    if (!invoice_id) return new Response(JSON.stringify({ error:'invoice_id required'}), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    const url = Deno.env.get('SUPABASE_URL')||'';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    const admin = createClient(url, key, { auth: { persistSession: false }});

    const { data, error } = await admin.rpc('cancel_invoice', { p_invoice_id: invoice_id, p_reason: reason ?? null }, { headers: { Authorization: `Bearer ${token}` }});
    if (error) return new Response(JSON.stringify({ error: error.message, details: error }), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    return new Response(JSON.stringify({ ok: true, result: data }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
  }
});

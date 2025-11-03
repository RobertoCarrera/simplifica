// @ts-nocheck
// Edge Function: ledger-export
// GET -> export verifactu.vw_ledger in JSON (default) or CSV when ?format=csv
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS')||'false').toLowerCase()==='true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  return { 'Access-Control-Allow-Origin': isAllowed && origin ? origin : allowAll ? '*' : '', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'GET, OPTIONS', 'Vary':'Origin' } as Record<string,string>;
}

serve(async (req)=>{
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error:'Method not allowed'}), { status:405, headers:{...headers,'Content-Type':'application/json'}});

  try{
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
    if (!token) return new Response(JSON.stringify({ error:'Missing Bearer token'}), { status:401, headers:{...headers,'Content-Type':'application/json'}});

    const url = new URL(req.url);
    const format = (url.searchParams.get('format')||'json').toLowerCase();
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')||'';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false }});

    let q = admin.from('verifactu.vw_ledger').select('*');
    if (from) q = q.gte('issue_time', from);
    if (to) q = q.lte('issue_time', to);
    const { data, error } = await q;
    if (error) return new Response(JSON.stringify({ error:error.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    if (format === 'csv'){
      const cols = Object.keys(data?.[0]||{ company_id: '', series:'', number:'', issue_time:'', customer_id:'', total_tax_base:'', total_vat:'', total_gross:'', chained_hash:'', previous_hash:'', state:'', send_status:'' });
      const rows = [cols.join(',')].concat((data||[]).map(r=>cols.map(k=>JSON.stringify(r[k]??'')).join(',')));
      return new Response(rows.join('\n'), { status:200, headers:{...headers,'Content-Type':'text/csv; charset=utf-8'}});
    }

    return new Response(JSON.stringify({ items: data||[] }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
  }
});

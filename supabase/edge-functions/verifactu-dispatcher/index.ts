// @ts-nocheck
// Edge Function: verifactu-dispatcher
// Processes verifactu.events with backoff and transitions: pending -> sending -> accepted/rejected
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS')||'false').toLowerCase()==='true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  return { 'Access-Control-Allow-Origin': isAllowed && origin ? origin : allowAll ? '*' : '', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Vary':'Origin' } as Record<string,string>;
}

const MAX_ATTEMPTS = Number(Deno.env.get('VERIFACTU_MAX_ATTEMPTS') || 7);
// minutes: 0, 1, 5, 15, 60, 180, 720
const BACKOFF_MIN = (Deno.env.get('VERIFACTU_BACKOFF') || '0,1,5,15,60,180,720').split(',').map(n=>Number(n.trim())).filter(n=>!isNaN(n));
const REJECT_RATE = Number(Deno.env.get('VERIFACTU_REJECT_RATE') || 0); // 0..1 for simulation

function isDue(ev: any): boolean {
  const attempts = ev.attempts ?? 0;
  const last = ev.sent_at ? new Date(ev.sent_at).getTime() : new Date(ev.created_at).getTime();
  const now = Date.now();
  const waitMin = BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length-1)] ?? 0;
  return now - last >= waitMin * 60_000;
}

async function processEvent(admin: any, ev: any){
  // mark sending + sent_at
  await admin.from('verifactu.events').update({ status:'sending', sent_at: new Date().toISOString() }).eq('id', ev.id);

  // TODO: integrate with AEAT sandbox; for now simulate
  const accept = Math.random() >= REJECT_RATE;

  if (accept){
    const response = { status: 'ACCEPTED', at: new Date().toISOString(), echo: { id: ev.id } };
    await admin.from('verifactu.events').update({ status:'accepted', response }).eq('id', ev.id);
    // reflect on invoice_meta
    if (ev.event_type === 'anulacion'){
      await admin.from('verifactu.invoice_meta').update({ status:'void' }).eq('invoice_id', ev.invoice_id);
    } else {
      await admin.from('verifactu.invoice_meta').update({ status:'accepted' }).eq('invoice_id', ev.invoice_id);
    }
    return { id: ev.id, status: 'accepted' };
  } else {
    const attempts = (ev.attempts ?? 0) + 1;
    const response = { status: 'REJECTED', at: new Date().toISOString(), reason: 'simulated rejection' };
    if (attempts >= MAX_ATTEMPTS){
      await admin.from('verifactu.events').update({ status:'rejected', attempts, last_error: 'max_attempts', response }).eq('id', ev.id);
      await admin.from('verifactu.invoice_meta').update({ status:'rejected' }).eq('invoice_id', ev.invoice_id);
      return { id: ev.id, status: 'rejected', attempts };
    } else {
      await admin.from('verifactu.events').update({ status:'pending', attempts, last_error: 'retry', response }).eq('id', ev.id);
      await admin.from('verifactu.invoice_meta').update({ status:'rejected' }).eq('invoice_id', ev.invoice_id);
      return { id: ev.id, status: 'retry', attempts };
    }
  }
}

serve( async (req)=>{
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error:'Method not allowed'}), { status:405, headers:{...headers,'Content-Type':'application/json'}});

  try{
    const url = Deno.env.get('SUPABASE_URL')||'';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    const admin = createClient(url, key, { auth: { persistSession: false }});

    // Optional manual actions via body
    let body: any = null;
    try {
      const txt = await req.text();
      body = txt ? JSON.parse(txt) : null;
    } catch(_) { /* ignore */ }

  // Safe manual retry: reset last rejected event to pending for an invoice
    if (body && body.action === 'retry' && body.invoice_id) {
      const invoice_id = String(body.invoice_id);
      // Find most recent rejected event for this invoice
      const { data: ev, error: evErr } = await admin
        .from('verifactu.events')
        .select('*')
        .eq('invoice_id', invoice_id)
        .eq('status', 'rejected')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (evErr) {
        return new Response(JSON.stringify({ ok:false, error: evErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
      }
      // If nothing to retry, respond gracefully
      if (!ev) {
        return new Response(JSON.stringify({ ok:false, message: 'No rejected event to retry for invoice' }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
      }
      // Reset to pending without changing attempts; clear last_error to avoid confusion
      const { error: updErr } = await admin
        .from('verifactu.events')
        .update({ status: 'pending', last_error: null })
        .eq('id', ev.id);
      if (updErr) {
        return new Response(JSON.stringify({ ok:false, error: updErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
      }
      return new Response(JSON.stringify({ ok:true, retried_event_id: ev.id }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
    }

    // Expose non-sensitive dispatcher configuration to clients (for UI ETA)
    if (body && body.action === 'config') {
      return new Response(
        JSON.stringify({ ok: true, maxAttempts: MAX_ATTEMPTS, backoffMinutes: BACKOFF_MIN }),
        { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    // Pull a batch of pending events
    const { data: events, error } = await admin.from('verifactu.events').select('*').eq('status','pending').order('created_at', { ascending: true }).limit(100);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    const due = (events||[]).filter(isDue);
    const results = [] as any[];
    for (const ev of due){
      try {
        results.push(await processEvent(admin, ev));
      } catch (e) {
        // hard failure: mark for retry
        const attempts = (ev.attempts ?? 0) + 1;
        await admin.from('verifactu.events').update({ status: attempts >= MAX_ATTEMPTS ? 'rejected' : 'pending', attempts, last_error: e?.message || 'dispatch_error' }).eq('id', ev.id);
      }
    }

    return new Response(JSON.stringify({ ok:true, polled: (events||[]).length, processed: results.length, results }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
  }
});

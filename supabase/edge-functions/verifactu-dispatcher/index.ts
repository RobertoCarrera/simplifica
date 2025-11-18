// @ts-nocheck
// Edge Function: verifactu-dispatcher
// Processes verifactu.events with backoff and transitions: pending -> sending -> accepted/rejected
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  return {
    'Access-Control-Allow-Origin': (isAllowed && origin) ? origin : (allowAll ? '*' : ''),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  } as Record<string,string>;
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
      // Park to DLQ for later replay
      await admin.from('verifactu.events_dlq').insert({
        original_event_id: ev.id,
        company_id: ev.company_id,
        invoice_id: ev.invoice_id,
        event_type: ev.event_type,
        payload: ev.payload,
        attempts,
        last_error: 'max_attempts',
        response
      });
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

    // For actions that require validating the caller against RLS (per-invoice access),
    // create a user-scoped client from the Authorization header and ensure the invoice exists for them.
    async function requireInvoiceAccess(invoice_id: string){
      const authHeader = req.headers.get('authorization') || '';
      const token = (authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
      if (!token) return { error: 'Missing Bearer token' };
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')||'';
      if (!anonKey) return { error: 'Missing SUPABASE_ANON_KEY' };
      const userClient = createClient(url, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data: inv, error: invErr } = await userClient.from('invoices').select('id').eq('id', invoice_id).maybeSingle();
      if (invErr) return { error: invErr.message };
      if (!inv) return { error: 'Invoice not found', status: 404 };
      return { ok: true };
    }

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

    // Health summary for UI without exposing verifactu schema over PostgREST
    if (body && body.action === 'health') {
      const evTable = admin.from('verifactu.events');
      const [pendingRes, lastRes, lastAccRes, lastRejRes] = await Promise.all([
        evTable.select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        evTable.select('created_at').order('created_at', { ascending: false }).limit(1),
        evTable.select('created_at').eq('status','accepted').order('created_at', { ascending: false }).limit(1),
        evTable.select('created_at').eq('status','rejected').order('created_at', { ascending: false }).limit(1)
      ]);
      const pending = pendingRes.count || 0;
      const lastEventAt = (lastRes.data && (lastRes.data as any[])[0]?.created_at) || null;
      const lastAcceptedAt = (lastAccRes.data && (lastAccRes.data as any[])[0]?.created_at) || null;
      const lastRejectedAt = (lastRejRes.data && (lastRejRes.data as any[])[0]?.created_at) || null;
      return new Response(
        JSON.stringify({ ok:true, pending, lastEventAt, lastAcceptedAt, lastRejectedAt }),
        { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    // DLQ listing (optionally scoped to invoice). Requires access if invoice_id provided
    if (body && body.action === 'dlq') {
      const limit = Number(body.limit || 20);
      const invoice_id = body.invoice_id ? String(body.invoice_id) : null;
      if (invoice_id) {
        const access = await requireInvoiceAccess(invoice_id);
        if ((access as any).error) {
          const status = (access as any).status || 401;
          return new Response(JSON.stringify({ ok:false, error: (access as any).error }), { status, headers:{...headers,'Content-Type':'application/json'}});
        }
      }
      let query = admin.from('verifactu.events_dlq').select('*').order('failed_at', { ascending: false }).limit(limit);
      if (invoice_id) query = query.eq('invoice_id', invoice_id);
      const { data, error: dlqErr } = await query;
      if (dlqErr) return new Response(JSON.stringify({ ok:false, error: dlqErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
      return new Response(JSON.stringify({ ok:true, dlq: data || [] }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
    }

    // Replay a DLQ entry by id (requires RLS access to the invoice)
    if (body && body.action === 'replay_dlq' && body.dlq_id) {
      const dlq_id = String(body.dlq_id);
      const { data: dlq, error: getErr } = await admin.from('verifactu.events_dlq').select('*').eq('id', dlq_id).maybeSingle();
      if (getErr) return new Response(JSON.stringify({ ok:false, error: getErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
      if (!dlq) return new Response(JSON.stringify({ ok:false, error: 'DLQ entry not found' }), { status:404, headers:{...headers,'Content-Type':'application/json'}});
      const access = await requireInvoiceAccess(dlq.invoice_id);
      if ((access as any).error) {
        const status = (access as any).status || 401;
        return new Response(JSON.stringify({ ok:false, error: (access as any).error }), { status, headers:{...headers,'Content-Type':'application/json'}});
      }
      // Avoid duplicate event constraints if one exists already
      const { data: existing } = await admin
        .from('verifactu.events')
        .select('id,status')
        .eq('invoice_id', dlq.invoice_id)
        .eq('event_type', dlq.event_type)
        .in('status', ['pending','sending','accepted'])
        .limit(1);
      if (existing && existing.length) {
        return new Response(JSON.stringify({ ok:false, error: 'Event already present or processed for invoice/type' }), { status:409, headers:{...headers,'Content-Type':'application/json'}});
      }
      const insertRes = await admin.from('verifactu.events').insert({
        company_id: dlq.company_id,
        invoice_id: dlq.invoice_id,
        event_type: dlq.event_type,
        payload: dlq.payload,
        status: 'pending',
        attempts: 0,
        last_error: null,
        response: null
      }).select('id').single();
      if (insertRes.error) {
        return new Response(JSON.stringify({ ok:false, error: insertRes.error.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
      }
      // Mark DLQ entry as replayed
      await admin.from('verifactu.events_dlq').update({ status: 'replayed', replayed_at: new Date().toISOString() }).eq('id', dlq_id);
      return new Response(JSON.stringify({ ok:true, new_event_id: insertRes.data.id }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
    }

    // Secure proxy: per-invoice VeriFactu metadata (requires caller to have RLS access to the invoice)
    if (body && body.action === 'meta' && body.invoice_id) {
      const invoice_id = String(body.invoice_id);
      const access = await requireInvoiceAccess(invoice_id);
      if ((access as any).error) {
        const status = (access as any).status || 401;
        return new Response(JSON.stringify({ ok:false, error: (access as any).error }), { status, headers:{...headers,'Content-Type':'application/json'}});
      }
      const { data: meta, error: metaErr } = await admin
        .from('verifactu.invoice_meta')
        .select('*')
        .eq('invoice_id', invoice_id)
        .maybeSingle();
      if (metaErr) return new Response(JSON.stringify({ ok:false, error: metaErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
      return new Response(JSON.stringify({ ok:true, meta }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
    }

    // Secure proxy: per-invoice VeriFactu events (requires caller to have RLS access to the invoice)
    if (body && body.action === 'events' && body.invoice_id) {
      const invoice_id = String(body.invoice_id);
      const limit = Number(body.limit || 5);
      const access = await requireInvoiceAccess(invoice_id);
      if ((access as any).error) {
        const status = (access as any).status || 401;
        return new Response(JSON.stringify({ ok:false, error: (access as any).error }), { status, headers:{...headers,'Content-Type':'application/json'}});
      }
      const { data: events, error: evErr } = await admin
        .from('verifactu.events')
        .select('*')
        .eq('invoice_id', invoice_id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (evErr) return new Response(JSON.stringify({ ok:false, error: evErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
      return new Response(JSON.stringify({ ok:true, events: events || [] }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
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
        const hardError = e?.message || 'dispatch_error';
        const rejected = attempts >= MAX_ATTEMPTS;
        await admin.from('verifactu.events').update({ status: rejected ? 'rejected' : 'pending', attempts, last_error: hardError }).eq('id', ev.id);
        if (rejected) {
          await admin.from('verifactu.events_dlq').insert({
            original_event_id: ev.id,
            company_id: ev.company_id,
            invoice_id: ev.invoice_id,
            event_type: ev.event_type,
            payload: ev.payload,
            attempts,
            last_error: hardError
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok:true, polled: (events||[]).length, processed: results.length, results }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
  }
});

// @ts-nocheck
// Edge Function: quotes-accept
// Public acceptance endpoint that:
// 1) Marks quote as accepted
// 2) Converts it to an invoice (draft)
// 3) Tries to finalize the invoice immediately (best effort)
// 4) Emails the invoice to the client via SES with a signed PDF link
//
// Auth model: This is intended to be used from a public client-portal link.
// If QUOTE_TOKEN_SECRET is set, the request must include a valid token generated as
// base64url(HMAC_SHA256(quote_id, QUOTE_TOKEN_SECRET)). If the secret is not set,
// the endpoint still works (for development), but logs an insecure mode note.
//
// Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// SES envs: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_FROM_ADDRESS
// Optional: ALLOW_ALL_ORIGINS=true or ALLOWED_ORIGINS=comma,list

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, originAllowed } from "./cors.ts";

// Minimal HMAC SHA-256 + helpers
const te = new TextEncoder();
function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function hmacSha256Raw(keyBytes: Uint8Array, data: string | Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const msg = typeof data === 'string' ? te.encode(data) : data;
  return await crypto.subtle.sign('HMAC', key, msg);
}

// AWS SigV4 pieces (reuse from quotes-email simplified)
async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const uint8 = typeof data === 'string' ? te.encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', uint8);
  return toHex(hash);
}
async function deriveSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256Raw(te.encode('AWS4' + secretKey), dateStamp);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, service);
  return await hmacSha256Raw(kService, 'aws4_request');
}
function amzDates(now: Date){
  const pad = (n:number)=> String(n).padStart(2,'0');
  const yyyy = now.getUTCFullYear();
  const MM = pad(now.getUTCMonth()+1);
  const dd = pad(now.getUTCDate());
  const HH = pad(now.getUTCHours());
  const mm = pad(now.getUTCMinutes());
  const ss = pad(now.getUTCSeconds());
  const amzDate = `${yyyy}${MM}${dd}T${HH}${mm}${ss}Z`;
  const dateStamp = `${yyyy}${MM}${dd}`;
  return { amzDate, dateStamp };
}
async function signAwsRequest(opts: { method: string; url: URL; region: string; service: string; accessKeyId: string; secretAccessKey: string; body?: string; }){
  const { method, url, region, service, accessKeyId, secretAccessKey } = opts;
  const body = opts.body ?? '';
  const { amzDate, dateStamp } = amzDates(new Date());
  const host = url.host;
  const payloadHash = await sha256Hex(body);

  const headers: Record<string,string> = { host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash };
  const sortedKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedKeys.map(k => `${k}:${String(headers[k]).trim()}\n`).join('');
  const signedHeaders = sortedKeys.join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    url.pathname || '/',
    '', // no query
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [ 'AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash ].join('\n');
  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmacSha256Raw(signingKey, te.encode(stringToSign)));
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, amzDate, payloadHash };
}

function cors(origin?: string){ return corsHeaders(origin, 'POST, OPTIONS'); }

function safeEmail(s?: string): string | null {
  const v = (s||'').trim();
  const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  return re.test(v) ? v : null;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (origin && !originAllowed(origin)) return new Response(JSON.stringify({ error: 'CORS_ORIGIN_FORBIDDEN' }), { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status:405, headers:{...headers,'Content-Type':'application/json'}});

  try{
    const { quote_id, token } = await req.json();
    if (!quote_id) return new Response(JSON.stringify({ error: 'quote_id is required' }), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')||'';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')||'';
    if (!SUPABASE_URL || !SERVICE_KEY) return new Response(JSON.stringify({ error:'Supabase not configured' }), { status:500, headers:{...headers,'Content-Type':'application/json'}});

    // Optional token validation
    const SECRET = Deno.env.get('QUOTE_TOKEN_SECRET')||'';
    if (SECRET) {
      const mac = await hmacSha256Raw(te.encode(SECRET), quote_id);
      const expected = base64url(new Uint8Array(mac));
      if (!token || token !== expected) {
        return new Response(JSON.stringify({ error:'Invalid token' }), { status:403, headers:{...headers,'Content-Type':'application/json'}});
      }
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Load quote and client data
    const { data: quote, error: qErr } = await admin
      .from('quotes')
      .select('id, company_id, client_id, full_quote_number, valid_until, status, client:clients(id,email,name)')
      .eq('id', quote_id)
      .single();
    if (qErr || !quote) return new Response(JSON.stringify({ error: 'Quote not found' }), { status:404, headers:{...headers,'Content-Type':'application/json'}});

    // Basic validations (idempotent behavior)
    const nowIso = new Date().toISOString();
    const isExpired = quote.valid_until && new Date(quote.valid_until) < new Date();
    if (isExpired) return new Response(JSON.stringify({ error:'Quote expired' }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
    if (['accepted','rejected','invoiced','cancelled','expired'].includes(quote.status)) {
      return new Response(JSON.stringify({ ok: true, idempotent: true, status: quote.status }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
    }

    // 1) Accept quote
    const { error: accErr } = await admin
      .from('quotes')
      .update({ status:'accepted', accepted_at: nowIso })
      .eq('id', quote_id);
    if (accErr) return new Response(JSON.stringify({ error: accErr.message || 'Failed to accept quote' }), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    // 2) Convert to invoice (draft)
    const { data: invId, error: convErr } = await admin.rpc('convert_quote_to_invoice', { p_quote_id: quote_id, p_invoice_series_id: null });
    if (convErr || !invId) return new Response(JSON.stringify({ error: convErr?.message || 'Conversion failed' }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
    const invoice_id = typeof invId === 'string' ? invId : invId as string;

    // 3) Try finalize immediately (best effort)
    let finalizeOk = false; let finalizeError: string | null = null;
    try {
      // Choose series: try default series via DB if backend handles it using a hint string
      const seriesHint = 'DEFAULT';
      const { error: finErr } = await admin.rpc('finalize_invoice', { p_invoice_id: invoice_id, p_series: seriesHint, p_device_id: null, p_software_id: null });
      if (!finErr) finalizeOk = true; else finalizeError = finErr.message || 'finalize_error';
    } catch(e){ finalizeError = (e?.message || String(e)); }

    // 4) Email invoice (only if client has email and SES configured)
    const region = Deno.env.get('AWS_REGION')||'';
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')||'';
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')||'';
    const fromEmail = (Deno.env.get('SES_FROM_ADDRESS')||'').trim();
    const toEmail = safeEmail(quote.client?.email || undefined);

    let emailResult: any = null;
    if (region && accessKeyId && secretAccessKey && fromEmail && toEmail) {
      // Get signed PDF link from invoices-pdf function (assumed public)
      const fnBase = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1`;
      const pdfRes = await fetch(`${fnBase}/invoices-pdf?invoice_id=${encodeURIComponent(invoice_id)}&download=1`);
      let pdfJson: any = null; try{ pdfJson = await pdfRes.json(); } catch(_){ pdfJson = {}; }
      const pdfUrl = pdfJson?.signedUrl || `${fnBase}/invoices-pdf?invoice_id=${encodeURIComponent(invoice_id)}&download=1`;

      // Fetch minimal invoice number info
      const { data: invInfo } = await admin
        .from('invoices')
        .select('full_invoice_number, invoice_series, invoice_number')
        .eq('id', invoice_id)
        .single();
      const invNumber = invInfo?.full_invoice_number || (invInfo?.invoice_series && invInfo?.invoice_number ? `${invInfo.invoice_series}-${invInfo.invoice_number}` : invoice_id.substring(0,8));

      const html = `
        <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
          <p>Hola${quote.client?.name ? ' ' + quote.client.name : ''},</p>
          <p>Gracias por aceptar el presupuesto ${quote.full_quote_number || ''}. Adjuntamos el enlace seguro para descargar tu factura.</p>
          <p><strong>Factura:</strong> ${invNumber}</p>
          <p><a href="${pdfUrl}" target="_blank">Descargar factura (PDF)</a></p>
          ${finalizeOk ? '' : '<p style="color:#a00">Nota: la factura está pendiente de finalización. Recibirás una confirmación en breve.</p>'}
          <p style="color:#666;font-size:12px">Este enlace es temporal y puede caducar.</p>
        </div>
      `;

      const endpoint = new URL(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`);
      const bodyJson = JSON.stringify({
        FromEmailAddress: fromEmail,
        Destination: { ToAddresses: [toEmail] },
        Content: { Simple: { Subject: { Data: `Factura ${invNumber}`, Charset: 'UTF-8' }, Body: { Html: { Data: html, Charset: 'UTF-8' } } } }
      });
      const { authorization, amzDate, payloadHash } = await signAwsRequest({ method: 'POST', url: endpoint, region, service: 'ses', accessKeyId, secretAccessKey, body: bodyJson });
      const res = await fetch(endpoint.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': authorization, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, 'Host': endpoint.host }, body: bodyJson });
      if (res.ok) { try{ emailResult = await res.json(); } catch(_){ emailResult = { ok:true }; } } else { emailResult = { ok:false, status: res.status, text: await res.text() }; }
    }

    return new Response(JSON.stringify({ ok:true, invoice_id, finalizeOk, finalizeError, emailed: !!emailResult, emailResult }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
  }
});

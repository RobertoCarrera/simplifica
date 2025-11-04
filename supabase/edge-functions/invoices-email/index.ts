// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Minimal AWS SigV4 signer (no external deps) for SES v2
const te = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const uint8 = typeof data === 'string' ? te.encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', uint8);
  return toHex(hash);
}

async function hmacSha256Raw(key: ArrayBuffer, data: string | Uint8Array): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const uint8 = typeof data === 'string' ? te.encode(data) : data;
  return await crypto.subtle.sign('HMAC', cryptoKey, uint8);
}

async function deriveSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256Raw(te.encode('AWS4' + secretKey), dateStamp);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, service);
  const kSigning = await hmacSha256Raw(kService, 'aws4_request');
  return kSigning;
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

async function signAwsRequest(opts: {
  method: string;
  url: URL;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  headers?: Record<string,string>;
  body?: string;
}){
  const { method, url, region, service, accessKeyId, secretAccessKey } = opts;
  const body = opts.body ?? '';
  const { amzDate, dateStamp } = amzDates(new Date());
  const host = url.host;
  const payloadHash = await sha256Hex(body);

  // Prepare headers (lower-cased for signing)
  const headers: Record<string,string> = {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };

  // Canonical headers
  const sortedHeaderKeys = Object.keys(headers)
    .map(k => k.toLowerCase())
    .sort();
  const canonicalHeaders = sortedHeaderKeys
    .map(k => `${k}:${headers[k] !== undefined ? String(headers[k]).trim().replace(/\s+/g,' ') : ''}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  // Canonical request
  const canonicalQuery = url.searchParams.toString() ?
    Array.from(url.searchParams.entries())
      .map(([k,v]) => [encodeURIComponent(k), encodeURIComponent(v)])
      .sort((a,b)=> a[0]===b[0]? (a[1]<b[1]?-1:a[1]>b[1]?1:0) : (a[0]<b[0]?-1:1))
      .map(([k,v]) => `${k}=${v}`)
      .join('&') : '';
  const canonicalRequest = [
    method.toUpperCase(),
    url.pathname || '/',
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalRequestHash
  ].join('\n');

  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmacSha256Raw(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, amzDate, payloadHash, headers: headers };
}

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS')||'false').toLowerCase()==='true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
  // Dev-friendly fallback: if nothing configured, allow common localhost origin
  if (allowed.length === 0 && !allowAll) allowed.push('http://localhost:4200');
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  const acao = isAllowed && origin ? origin : allowAll ? '*' : '';
  return {
    'Access-Control-Allow-Origin': acao,
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  } as Record<string,string>;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status:405, headers:{...headers,'Content-Type':'application/json'}});

  try{
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
    if (!token) return new Response(JSON.stringify({ error:'Missing Bearer token'}), { status:401, headers:{...headers,'Content-Type':'application/json'}});

    const { invoice_id, to, subject, message } = await req.json();
    if (!invoice_id || !to) return new Response(JSON.stringify({ error: 'invoice_id and to are required' }), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    const url = Deno.env.get('SUPABASE_URL')||'';
    const anon = Deno.env.get('SUPABASE_ANON_KEY')||'';
    const adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    const region = Deno.env.get('AWS_REGION')||'';
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')||'';
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')||'';
    const fromEmail = Deno.env.get('SES_FROM_ADDRESS')||'';
    if (!region || !accessKeyId || !secretAccessKey || !fromEmail) {
      return new Response(JSON.stringify({ error: 'SES not configured' }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
    }

    // Use a user-scoped client with RLS to validate access to the invoice
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false }});
    const { data: invoice, error: invErr } = await userClient
      .from('invoices')
      .select('id, full_invoice_number, invoice_series, invoice_number, client:clients(name,email)')
      .eq('id', invoice_id)
      .single();
    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not accessible' }), { status:403, headers:{...headers,'Content-Type':'application/json'}});
    }

    // Get a signed link via invoices-pdf function (JSON response) using user's token for RLS
    const fnBase = `${url.replace(/\/$/, '')}/functions/v1`;
    const pdfRes = await fetch(`${fnBase}/invoices-pdf?invoice_id=${encodeURIComponent(invoice_id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const pdfJson = await pdfRes.json().catch(()=>({}));
    if (!pdfRes.ok || !pdfJson?.url) {
      return new Response(JSON.stringify({ error: 'Could not obtain signed PDF URL' }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
    }
    const pdfUrl = String(pdfJson.url);

    const invNumber = invoice.full_invoice_number || `${invoice.invoice_series}-${invoice.invoice_number}`;
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
        <p>Hola${invoice.client?.name ? ' ' + invoice.client.name : ''},</p>
        <p>${message || 'Te enviamos el enlace seguro para descargar tu factura.'}</p>
        <p><strong>Factura:</strong> ${invNumber}</p>
        <p><a href="${pdfUrl}" target="_blank">Descargar factura (PDF)</a></p>
        <p style="color:#666;font-size:12px">Este enlace es temporal y puede caducar.</p>
      </div>
    `;

    const endpoint = new URL(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`);
    const bodyJson = JSON.stringify({
      FromEmailAddress: fromEmail,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject || `Factura ${invNumber}`, Charset: 'UTF-8' },
          Body: { Html: { Data: html, Charset: 'UTF-8' } }
        }
      }
    });
    const { authorization, amzDate, payloadHash } = await signAwsRequest({
      method: 'POST',
      url: endpoint,
      region,
      service: 'ses',
      accessKeyId,
      secretAccessKey,
      body: bodyJson
    });
    const res = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Host': endpoint.host
      },
      body: bodyJson
    });

    if (!res.ok) {
      const t = await res.text();
      return new Response(JSON.stringify({ error: 'SES send failed', details: t }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
    }

    const sendResult = await res.json().catch(()=>({ ok:true }));
    return new Response(JSON.stringify({ ok:true, result: sendResult }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
  }
});

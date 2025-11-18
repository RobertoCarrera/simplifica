// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, originAllowed } from "./cors.ts";
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
  // Only sign the mandatory headers to avoid case/normalization issues
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

function cors(origin?: string){ return corsHeaders(origin, 'POST, OPTIONS'); }

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  // Preflight
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (origin && !originAllowed(origin)) return new Response(JSON.stringify({ error: 'CORS_ORIGIN_FORBIDDEN' }), { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status:405, headers:{...headers,'Content-Type':'application/json'}});

  try{
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
    if (!token) return new Response(JSON.stringify({ error:'Missing Bearer token'}), { status:401, headers:{...headers,'Content-Type':'application/json'}});

    const { quote_id, to, subject, message } = await req.json();
    if (!quote_id || !to) return new Response(JSON.stringify({ error: 'quote_id and to are required' }), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    // Validate basic email formats (avoid SES 400s for obvious invalids)
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const toClean = String(to).trim();
    if (!emailRegex.test(toClean)) {
      return new Response(JSON.stringify({ error: 'Invalid recipient email format', details: 'Recipient must be a valid email like user@example.com' }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
    }

    const url = Deno.env.get('SUPABASE_URL')||'';
    const anon = Deno.env.get('SUPABASE_ANON_KEY')||'';
    const region = Deno.env.get('AWS_REGION')||'';
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')||'';
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')||'';
    const fromEmail = (Deno.env.get('SES_FROM_ADDRESS')||'').trim();
    if (!region || !accessKeyId || !secretAccessKey || !fromEmail) {
      const missing: string[] = [];
      if (!region) missing.push('AWS_REGION');
      if (!accessKeyId) missing.push('AWS_ACCESS_KEY_ID');
      if (!secretAccessKey) missing.push('AWS_SECRET_ACCESS_KEY');
      if (!fromEmail) missing.push('SES_FROM_ADDRESS');
      return new Response(JSON.stringify({ error: 'SES not configured', missing }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
    }
    if (!emailRegex.test(fromEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid SES_FROM_ADDRESS', details: 'SES_FROM_ADDRESS must be a full verified email address' }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
    }

    // Validate access to quote using user-scoped client (RLS)
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false }});
    const { data: quote, error: qErr } = await userClient
      .from('quotes')
      .select('id, full_quote_number, quote_number, year, client:clients(name,email)')
      .eq('id', quote_id)
      .single();
    if (qErr || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not accessible' }), { status:403, headers:{...headers,'Content-Type':'application/json'}});
    }

    const qNumber = quote.full_quote_number || quote.quote_number || `PRES-${quote.year}`;

    // Auth-only deep link (no public token). Fallback to request Origin if env not set.
    const reqOrigin = (req.headers.get('Origin') || '').replace(/\/$/, '');
    const APP_URL = (Deno.env.get('FRONTEND_APP_URL') || reqOrigin || '').replace(/\/$/, '');
  // Client portal entry after login; we pass open=<quote_id> to allow UI to focus it later
  const loginLink = APP_URL ? `${APP_URL}/login?returnUrl=${encodeURIComponent('/portal/presupuestos/' + quote_id)}` : '';

    // Email HTML
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
        <p>Hola${quote.client?.name ? ' ' + quote.client.name : ''},</p>
        <p>${message || 'Te enviamos tu presupuesto para tu revisión.'}</p>
        <p><strong>Presupuesto:</strong> ${qNumber}</p>
  ${loginLink ? `<p style=\"margin:16px 0\"><a href=\"${loginLink}\" target=\"_blank\" style=\"display:inline-block;padding:10px 16px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px\">Abrir presupuesto</a></p>` : ''}
        <p style="color:#666;font-size:12px">Si tienes cualquier consulta, responde a este email.</p>
      </div>
    `;

    const endpoint = new URL(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`);
    const bodyJson = JSON.stringify({
      FromEmailAddress: fromEmail,
  Destination: { ToAddresses: [toClean] },
      Content: {
        Simple: {
          Subject: { Data: subject || `Presupuesto ${qNumber}`, Charset: 'UTF-8' },
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
    
    // ✅ Actualizar estado del presupuesto a 'sent' después de enviar el email exitosamente
    console.log(`📧 Email enviado correctamente. Actualizando estado del presupuesto ${quote_id} a 'sent'...`);
    
    const { error: updateError } = await userClient
      .from('quotes')
      .update({ status: 'sent' })
      .eq('id', quote_id);
    
    if (updateError) {
      console.error('⚠️ Error al actualizar estado del presupuesto:', updateError);
      // No lanzamos error aquí porque el email ya se envió correctamente
      // Solo logueamos el problema
    } else {
      console.log('✅ Estado del presupuesto actualizado a "sent"');
    }
    
    return new Response(JSON.stringify({ ok:true, result: sendResult }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
  }
});

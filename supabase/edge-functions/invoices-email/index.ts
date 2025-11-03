// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@2.0.10";

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS')||'false').toLowerCase()==='true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  return { 'Access-Control-Allow-Origin': isAllowed && origin ? origin : allowAll ? '*' : '', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Vary':'Origin' } as Record<string,string>;
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

    // Get a signed link via invoices-pdf function
    const fnBase = `${url.replace(/\/$/, '')}/functions/v1`;
    const pdfRes = await fetch(`${fnBase}/invoices-pdf?invoice_id=${encodeURIComponent(invoice_id)}&download=1`);
    const pdfJson = await pdfRes.json().catch(()=>({}));
    const pdfUrl = pdfJson?.signedUrl || `${fnBase}/invoices-pdf?invoice_id=${encodeURIComponent(invoice_id)}&download=1`;

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

    const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: 'ses' });
    const res = await aws.fetch(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        FromEmailAddress: fromEmail,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject || `Factura ${invNumber}`, Charset: 'UTF-8' },
            Body: { Html: { Data: html, Charset: 'UTF-8' } }
          }
        }
      })
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

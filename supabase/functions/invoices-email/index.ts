// @ts-nocheck
// Edge Function: invoices-email
// Purpose: Send invoice email via send-branded-email (with SES fallback)
// CORS behavior aligned with quotes-pdf/invoices-pdf (OPTIONS -> 200 'ok', ACAO reflect matched origin)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';

function cors(origin?: string) {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isAllowed = origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  } as Record<string, string>;
}

// Helper: call send-branded-email Edge Function with fallback to direct SES
async function sendBrandedEmail(params: {
  companyId: string;
  emailType: string;
  to: { email: string; name: string }[];
  subject?: string;
  data: Record<string, unknown>;
  supabaseUrl: string;
  serviceRoleKey: string;
  // Fallback params
  fallbackHtml: string;
  fallbackToEmail: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
}): Promise<{ success: boolean; error?: string }> {
  const { supabaseUrl, serviceRoleKey, companyId, emailType, to, subject, data } = params;

  try {
    const functionsBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
    const brandedResponse = await fetch(`${functionsBase}/send-branded-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ companyId, emailType, to, subject, data }),
    });

    const result = await brandedResponse.json();
    if (result.success) {
      return { success: true };
    }
    console.warn('[invoices-email] send-branded-email returned error:', result.error);
    return { success: false, error: result.error };
  } catch (e) {
    console.warn('[invoices-email] send-branded-email not available, falling back to direct SES');
    return { success: false, error: 'send-branded-email unavailable' };
  }
}

// Fallback direct SES sender
async function sendViaSES(params: {
  html: string;
  to: string;
  subject: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
}): Promise<{ success: boolean; error?: string }> {
  const { html, to, subject, region, accessKeyId, secretAccessKey, fromEmail } = params;
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region });
  const endpoint = new URL(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`);
  const bodyJson = JSON.stringify({
    FromEmailAddress: fromEmail,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    },
  });
  const res = await aws.fetch(endpoint.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyJson,
  });
  if (!res.ok) {
    const t = await res.text();
    return { success: false, error: t };
  }
  return { success: true };
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

  // Rate limiting: 10 req/min per IP (sends outbound SES emails with signed PDF links)
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`invoices-email:${ip}`, 10, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...headers, 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) },
    });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!token)
      return new Response(JSON.stringify({ error: 'Missing Bearer token' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    const body = (await req.json().catch(() => null)) as any;
    const invoice_id = String(body?.invoice_id || '');
    const to = String(body?.to || '').trim();
    const subject = body?.subject ? String(body.subject) : '';
    const message = body?.message ? String(body.message) : '';
    if (!invoice_id || !to)
      return new Response(JSON.stringify({ error: 'invoice_id and to are required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(invoice_id))
      return new Response(JSON.stringify({ error: 'Invalid invoice_id format' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(to))
      return new Response(JSON.stringify({ error: 'Invalid recipient email format' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY)
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY envs' }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
      );

    // Validate access to invoice with user-scoped client
    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: invoice, error: invErr } = await user
      .from('invoices')
      .select(
        'id, full_invoice_number, invoice_number, invoice_series, year, client:clients(name,email,company_id)',
      )
      .eq('id', invoice_id)
      .single();
    if (invErr || !invoice)
      return new Response(JSON.stringify({ error: 'Invoice not accessible' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    const companyId = invoice.client?.company_id || '';

    const escHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const series = invoice.invoice_series || 'SER';
    const number = invoice.invoice_number || '';
    const invLabel = escHtml(
      invoice.full_invoice_number || (number ? `${series}-${number}` : series),
    );

    // Obtain signed PDF URL by calling invoices-pdf with the same user token
    const functionsBase = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1`;
    const pdfRes = await fetch(
      `${functionsBase}/invoices-pdf?invoice_id=${encodeURIComponent(invoice_id)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    let signedUrl = '';
    try {
      const json = await pdfRes.json();
      signedUrl = json?.url || '';
    } catch {
      signedUrl = '';
    }
    if (!pdfRes.ok || !signedUrl) {
      return new Response(JSON.stringify({ error: 'Could not obtain signed PDF URL' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Prepare email contents
    const APP_URL = (Deno.env.get('FRONTEND_APP_URL') || '').replace(/\/$/, '');
    const loginLink = APP_URL
      ? `${APP_URL}/login?returnUrl=${encodeURIComponent('/facturacion/' + invoice_id)}`
      : '';

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
        <p>Hola${invoice.client?.name ? ' ' + escHtml(invoice.client.name) : ''},</p>
        <p>${message ? escHtml(message) : 'Te enviamos tu factura. Puedes descargar el PDF desde el siguiente enlace seguro:'}</p>
        <p><strong>Factura:</strong> ${invLabel}</p>
        <p style="margin:16px 0">
          <a href="${signedUrl}" target="_blank" style="display:inline-block;padding:10px 16px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px">Ver factura PDF</a>
        </p>
        ${loginLink ? `<p style="margin:16px 0"><a href="${loginLink}" target="_blank" style="display:inline-block;padding:10px 16px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px">Abrir en Simplifica</a></p>` : ''}
        <p style="color:#666;font-size:12px">Si tienes cualquier consulta, responde a este email.</p>
      </div>
    `;

    // SES config for fallback
    const region = Deno.env.get('AWS_REGION') || '';
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID') || '';
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY') || '';
    const fromEmail = (Deno.env.get('SES_FROM_ADDRESS') || '').trim();
    if (!region || !accessKeyId || !secretAccessKey || !fromEmail) {
      const missing: string[] = [];
      if (!region) missing.push('AWS_REGION');
      if (!accessKeyId) missing.push('AWS_ACCESS_KEY_ID');
      if (!secretAccessKey) missing.push('AWS_SECRET_ACCESS_KEY');
      if (!fromEmail) missing.push('SES_FROM_ADDRESS');
      return new Response(JSON.stringify({ error: 'SES not configured', missing }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
    const emailRegexFrom = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegexFrom.test(fromEmail))
      return new Response(JSON.stringify({ error: 'Invalid SES_FROM_ADDRESS' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    // Try send-branded-email first, fall back to direct SES
    let emailSent = false;
    if (companyId && SERVICE_ROLE_KEY) {
      const brandedResult = await sendBrandedEmail({
        companyId,
        emailType: 'invoice',
        to: [{ email: to, name: invoice.client?.name || '' }],
        subject: subject || undefined,
        data: { invoice, signedUrl, loginLink, message },
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SERVICE_ROLE_KEY,
        fallbackHtml: html,
        fallbackToEmail: to,
        region,
        accessKeyId,
        secretAccessKey,
        fromEmail,
      });
      if (brandedResult.success) {
        emailSent = true;
      } else if (brandedResult.error !== 'send-branded-email unavailable') {
        return new Response(JSON.stringify({ error: 'Branded email failed', details: brandedResult.error }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fallback to direct SES if branded email not available or companyId not set
    if (!emailSent) {
      const sesResult = await sendViaSES({
        html,
        to,
        subject: subject || `Factura ${invLabel}`,
        region,
        accessKeyId,
        secretAccessKey,
        fromEmail,
      });
      if (!sesResult.success) {
        console.error('[invoices-email] SES send failed:', sesResult.error);
        return new Response(JSON.stringify({ error: 'SES send failed' }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
    }

    // Mark invoice as sent (best-effort)
    await user.from('invoices').update({ status: 'sent' }).eq('id', invoice_id);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[invoices-email] Unhandled error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
});
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';
import { withCsrf } from '../_shared/csrf-middleware.ts';
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
    'Access-Control-Max-Age': '86400',
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
  fallbackSubject: string;
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
    console.warn('[quotes-email] send-branded-email returned error:', result.error);
    return { success: false, error: result.error };
  } catch (e) {
    console.warn('[quotes-email] send-branded-email not available, falling back to direct SES');
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

serve(withCsrf(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  // Preflight
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

  // Rate limiting: 10 req/min per IP (sends outbound SES emails)
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`quotes-email:${ip}`, 10, 60000);
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

    const { quote_id, to, subject, message } = await req.json();
    if (!quote_id || !to)
      return new Response(JSON.stringify({ error: 'quote_id and to are required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    // Validate basic email formats (avoid SES 400s for obvious invalids)
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const toClean = String(to).trim();
    if (!emailRegex.test(toClean)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid recipient email format',
          details: 'Recipient must be a valid email like user@example.com',
        }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
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
    if (!emailRegex.test(fromEmail)) {
      console.error('[quotes-email] Invalid SES_FROM_ADDRESS format');
      return new Response(JSON.stringify({ error: 'SES misconfiguration' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Create admin client to look up user company_id
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    // Get authenticated user
    const {
      data: { user: authUser },
      error: authErr,
    } = await admin.auth.getUser(token);
    if (authErr || !authUser) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Get user company_id for RLS enforcement
    const { data: me } = await admin
      .from('users')
      .select('company_id')
      .eq('auth_user_id', authUser.id)
      .single();
    if (!me) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Validate access to quote using user-scoped client (RLS + company_id)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: quote, error: qErr } = await userClient
      .from('quotes')
      .select('id, full_quote_number, quote_number, year, company_id, client:clients(name,email,company_id)')
      .eq('id', quote_id)
      .eq('company_id', me.company_id)
      .single();
    if (qErr || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not accessible' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const companyId = quote.client?.company_id || '';

    const escHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const qNumber = escHtml(quote.full_quote_number || quote.quote_number || `PRES-${quote.year}`);

    // Auth-only deep link (no public token). Use only the configured env var — never trust Origin header.
    const APP_URL = (Deno.env.get('FRONTEND_APP_URL') || '').replace(/\/$/, '');
    // Client portal entry after login; we pass open=<quote_id> to allow UI to focus it later
    const loginLink = APP_URL
      ? `${APP_URL}/login?returnUrl=${encodeURIComponent('/portal/presupuestos/' + quote_id)}`
      : '';

    // Email HTML
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
        <p>Hola${quote.client?.name ? ' ' + escHtml(quote.client.name) : ''},</p>
        <p>${message ? escHtml(message) : 'Te enviamos tu presupuesto para tu revisión.'}</p>
        <p><strong>Presupuesto:</strong> ${qNumber}</p>
  ${loginLink ? `<p style=\"margin:16px 0\"><a href=\"${loginLink}\" target=\"_blank\" style=\"display:inline-block;padding:10px 16px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px\">Abrir presupuesto</a></p>` : ''}
        <p style="color:#666;font-size:12px">Si tienes cualquier consulta, responde a este email.</p>
      </div>
    `;

    const subjectLine = subject || `Presupuesto ${qNumber}`;

    // Try send-branded-email first, fall back to direct SES
    let emailSent = false;
    if (companyId && SERVICE_ROLE_KEY) {
      const brandedResult = await sendBrandedEmail({
        companyId,
        emailType: 'quote',
        to: [{ email: toClean, name: quote.client?.name || '' }],
        subject: subject || undefined,
        data: { quote, loginLink, message },
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SERVICE_ROLE_KEY,
        fallbackHtml: html,
        fallbackToEmail: toClean,
        fallbackSubject: subjectLine,
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
        to: toClean,
        subject: subjectLine,
        region,
        accessKeyId,
        secretAccessKey,
        fromEmail,
      });
      if (!sesResult.success) {
        console.error('[quotes-email] SES send failed', sesResult.error);
        return new Response(JSON.stringify({ error: 'SES send failed' }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
    }

    // ✅ Actualizar estado del presupuesto a 'sent' después de enviar el email exitosamente
    console.log(
      `📧 Email enviado correctamente. Actualizando estado del presupuesto ${quote_id} a 'sent'...`,
    );

    const { error: updateError } = await userClient
      .from('quotes')
      .update({ status: 'sent' })
      .eq('id', quote_id)
      .eq('company_id', me.company_id);

    if (updateError) {
      console.error('⚠️ Error al actualizar estado del presupuesto:', updateError);
    } else {
      console.log('✅ Estado del presupuesto actualizado a "sent"');
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[quotes-email] Error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
});
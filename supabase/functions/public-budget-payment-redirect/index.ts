// @ts-nocheck
// ==============================================
// Edge Function: public-budget-payment-redirect
// ==============================================
// PUBLIC — no auth, token-gated. Two responsibilities:
//
//   1. GET  (Stripe/PayPal return URL) → 302 redirect to the public
//      payment page with ?status=success|cancelled
//   2. POST (called by the public payment page) → mint a fresh Stripe
//      checkout session or PayPal order for the budget identified by
//      the token. Returns the provider's payment_url.
//
// POST body: { token: string, provider: 'stripe' | 'paypal' | 'cash' | 'bank_transfer' }
// ==============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') || '';
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[public-budget-payment-redirect] ENCRYPTION_KEY must be at least 32 characters');
}
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://app.simplificacrm.es';

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function isValidToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

function safeRedirect(target: string, corsHeaders: HeadersInit): Response {
  let safe = target;
  try {
    const u = new URL(target, PUBLIC_SITE_URL);
    if (u.origin !== new URL(PUBLIC_SITE_URL).origin) {
      safe = `${PUBLIC_SITE_URL}/`;
    } else {
      safe = u.toString();
    }
  } catch {
    safe = `${PUBLIC_SITE_URL}/`;
  }
  return new Response(null, { status: 302, headers: withSecurityHeaders({ ...corsHeaders, Location: safe }) });
}

async function decrypt(encryptedBase64: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(ENCRYPTION_KEY.slice(0, 32));
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return '';
  }
}

// ── PayPal ────────────────────────────────────────────────────────────────
async function createPayPalOrder(
  credentials: { clientId: string; clientSecret: string },
  isSandbox: boolean,
  budget: any,
  paymentToken: string,
  returnUrl: string,
  cancelUrl: string,
): Promise<{ orderId: string; approvalUrl: string } | { error: string }> {
  const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  try {
    const auth = btoa(`${credentials.clientId}:${credentials.clientSecret}`);
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok) return { error: 'PayPal auth failed' };
    const { access_token } = await tokenRes.json();
    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: budget.id,
          custom_id: `budget_${paymentToken}`,
          description: `Presupuesto ${budget.period}`,
          amount: { currency_code: (budget.currency || 'EUR').toUpperCase(), value: Number(budget.total).toFixed(2) },
        }],
        application_context: {
          brand_name: budget.company_name || 'Simplifica',
          locale: 'es-ES',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });
    if (!orderRes.ok) return { error: 'PayPal order create failed' };
    const order = await orderRes.json();
    const approvalUrl = order.links?.find((l: any) => l.rel === 'approve')?.href;
    return { orderId: order.id, approvalUrl };
  } catch (e: any) {
    console.error('[public-budget-payment-redirect] paypal error:', e);
    return { error: 'PayPal error' };
  }
}

// ── Stripe ────────────────────────────────────────────────────────────────
async function createStripeCheckout(
  credentials: { secretKey: string },
  budget: any,
  paymentToken: string,
  returnUrl: string,
  cancelUrl: string,
): Promise<{ sessionId: string; checkoutUrl: string } | { error: string }> {
  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'payment',
        success_url: returnUrl,
        cancel_url: cancelUrl,
        'line_items[0][price_data][currency]': (budget.currency || 'EUR').toLowerCase(),
        'line_items[0][price_data][product_data][name]': `Presupuesto ${budget.period}`,
        'line_items[0][price_data][product_data][description]': budget.client_name || 'Pago de presupuesto',
        'line_items[0][price_data][unit_amount]': Math.round(Number(budget.total) * 100).toString(),
        'line_items[0][quantity]': '1',
        'metadata[payment_link_token]': paymentToken,
        'metadata[budget_id]': budget.id,
        'metadata[period]': budget.period,
        customer_email: budget.client_email || '',
        locale: 'es',
      }),
    });
    if (!response.ok) {
      const err = await response.json();
      return { error: err.error?.message || 'Stripe error' };
    }
    const session = await response.json();
    return { sessionId: session.id, checkoutUrl: session.url };
  } catch (e: any) {
    console.error('[public-budget-payment-redirect] stripe error:', e);
    return { error: 'Stripe error' };
  }
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || null;
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: withSecurityHeaders(corsHeaders) });
  }

  const ip = getClientIP(req);
  const rl = await checkRateLimit(`public-budget-payment-redirect:${ip}`, 30, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429, headers: withSecurityHeaders({ ...corsHeaders, ...getRateLimitHeaders(rl) }),
    });
  }

  // GET → 302 redirect (Stripe/PayPal return URLs)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const status = url.searchParams.get('status') || 'success';
    const provider = url.searchParams.get('provider') || '';

    if (!token || !isValidToken(token)) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 400, headers: withSecurityHeaders(corsHeaders),
      });
    }
    if (!['success', 'cancelled'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Estado inválido' }), {
        status: 400, headers: withSecurityHeaders(corsHeaders),
      });
    }

    const params = new URLSearchParams();
    params.set('status', status);
    if (provider) params.set('provider', provider);
    const target = `${PUBLIC_SITE_URL}/pagar-presupuesto/${encodeURIComponent(token)}?${params.toString()}`;
    return safeRedirect(target, corsHeaders);
  }

  // POST → mint checkout session
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: withSecurityHeaders(corsHeaders),
    });
  }

  try {
    const { token, provider } = await req.json();
    if (!token || typeof token !== 'string' || !isValidToken(token)) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 400, headers: withSecurityHeaders(corsHeaders),
      });
    }
    if (!['stripe', 'paypal', 'cash', 'bank_transfer'].includes(provider)) {
      return new Response(JSON.stringify({ error: 'Provider inválido' }), {
        status: 400, headers: withSecurityHeaders(corsHeaders),
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: budget, error } = await supabase
      .from('recurring_budgets')
      .select(`
        id, period, total, currency, status, payment_status, company_id, client_id,
        clients!inner(name, email),
        companies!inner(name)
      `)
      .eq('payment_link_token', token)
      .maybeSingle();

    if (error || !budget) {
      return new Response(JSON.stringify({ error: 'Presupuesto no encontrado' }), {
        status: 404, headers: withSecurityHeaders(corsHeaders),
      });
    }
    if (budget.payment_status === 'paid' || budget.status === 'paid') {
      return new Response(JSON.stringify({ error: 'Este presupuesto ya está pagado' }), {
        status: 400, headers: withSecurityHeaders(corsHeaders),
      });
    }

    if (provider === 'cash' || provider === 'bank_transfer') {
      return new Response(
        JSON.stringify({
          success: true,
          provider,
          requires_manual_confirmation: true,
          message: provider === 'cash'
            ? 'Acude a la empresa para realizar el pago en efectivo. Una vez recibido, se confirmará desde el panel.'
            : 'Realiza la transferencia con los datos de la empresa. Una vez recibida, se confirmará desde el panel.',
        }),
        { status: 200, headers: withSecurityHeaders(corsHeaders) },
      );
    }

    const { data: integration, error: intErr } = await supabase
      .from('payment_integrations')
      .select('id, credentials_encrypted, is_sandbox, provider, is_active')
      .eq('company_id', budget.company_id)
      .eq('provider', provider)
      .eq('is_active', true)
      .maybeSingle();

    if (intErr || !integration) {
      return new Response(
        JSON.stringify({ error: `No hay integración activa de ${provider}` }),
        { status: 400, headers: withSecurityHeaders(corsHeaders) },
      );
    }

    const credentials = JSON.parse(await decrypt(integration.credentials_encrypted));
    const returnUrl = `${PUBLIC_SITE_URL}/pagar-presupuesto/${encodeURIComponent(token)}?status=success&provider=${provider}`;
    const cancelUrl = `${PUBLIC_SITE_URL}/pagar-presupuesto/${encodeURIComponent(token)}?status=cancelled&provider=${provider}`;

    const budgetData = {
      id: budget.id,
      period: budget.period,
      total: budget.total,
      currency: budget.currency || 'EUR',
      client_name: budget.clients?.name,
      client_email: budget.clients?.email,
      company_name: budget.companies?.name,
    };

    const result = provider === 'paypal'
      ? await createPayPalOrder(credentials, integration.is_sandbox, budgetData, token, returnUrl, cancelUrl)
      : await createStripeCheckout(credentials, budgetData, token, returnUrl, cancelUrl);

    if ('error' in result) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500, headers: withSecurityHeaders(corsHeaders),
      });
    }

    await supabase
      .from('recurring_budgets')
      .update({ payment_provider: provider, payment_status: 'pending' })
      .eq('id', budget.id);

    const paymentUrl = provider === 'paypal'
      ? (result as any).approvalUrl
      : (result as any).checkoutUrl;

    return new Response(
      JSON.stringify({ success: true, provider, payment_url: paymentUrl }),
      { status: 200, headers: withSecurityHeaders(corsHeaders) },
    );
  } catch (e: any) {
    console.error('[public-budget-payment-redirect] Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: withSecurityHeaders(corsHeaders),
    });
  }
});

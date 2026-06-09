// @ts-nocheck
// ==============================================
// Edge Function: create-budget-payment-link
// ==============================================
// Authenticated (Bearer) entry point that creates a payment link for a
// recurring_budgets row. Mirrors create-payment-link (for invoices) but
// targets the auto-generated presupuestos from contracted services.
//
// POST /create-budget-payment-link
// body: {
//   budget_id: uuid,
//   provider:  'stripe' | 'paypal' | 'cash' | 'bank_transfer',
//   expires_in_days?: number   (default 30, max 90)
// }
// ==============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, isValidUUID } from '../_shared/security.ts';
import { withCsrf } from '../_shared/csrf-middleware.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') || '';
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[create-budget-payment-link] ENCRYPTION_KEY must be at least 32 characters');
}
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://app.simplificacrm.es';

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-csrf-token',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
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

// ── Provider-specific: PayPal ──────────────────────────────────────────────
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
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok) return { error: 'Error autenticando con PayPal' };

    const { access_token } = await tokenRes.json();
    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: budget.id,
            custom_id: `budget_${paymentToken}`,
            description: `Presupuesto ${budget.period}`,
            amount: {
              currency_code: (budget.currency || 'EUR').toUpperCase(),
              value: Number(budget.total).toFixed(2),
            },
          },
        ],
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
    if (!orderRes.ok) {
      const err = await orderRes.json();
      console.error('[create-budget-payment-link] PayPal order error:', err);
      return { error: 'Error creando orden en PayPal' };
    }
    const order = await orderRes.json();
    const approvalUrl = order.links?.find((l: any) => l.rel === 'approve')?.href;
    return { orderId: order.id, approvalUrl };
  } catch (e: any) {
    console.error('[create-budget-payment-link] PayPal error:', e);
    return { error: 'Error con PayPal' };
  }
}

// ── Provider-specific: Stripe ──────────────────────────────────────────────
async function createStripeCheckout(
  credentials: { secretKey: string; publishableKey?: string },
  isSandbox: boolean,
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
        'line_items[0][price_data][product_data][description]':
          budget.client_name || 'Pago de presupuesto',
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
      console.error('[create-budget-payment-link] Stripe error:', err);
      return { error: err.error?.message || 'Error creando sesión en Stripe' };
    }
    const session = await response.json();
    return { sessionId: session.id, checkoutUrl: session.url };
  } catch (e: any) {
    console.error('[create-budget-payment-link] Stripe error:', e);
    return { error: 'Error con Stripe' };
  }
}

serve(withCsrf(async (req) => {
  const origin = req.headers.get('Origin') || null;
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const ip = getClientIP(req);
  const rl = await checkRateLimit(`create-budget-payment-link:${ip}`, 10, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, ...getRateLimitHeaders(rl) },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Get the user profile to know their company
    const { data: me } = await supabase
      .from('users')
      .select('id, company_id, active, client_id, role:app_roles(name)')
      .eq('auth_user_id', user.id)
      .single();

    if (!me?.company_id || !me.active) {
      return new Response(JSON.stringify({ error: 'User not found or inactive' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const body = await req.json();
    const { budget_id, provider, expires_in_days: rawExpiresDays = 30 } = body;
    const expires_in_days = Math.max(1, Math.min(90, Number(rawExpiresDays) || 30));

    if (!budget_id || !provider) {
      return new Response(JSON.stringify({ error: 'budget_id and provider required' }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (!isValidUUID(budget_id)) {
      return new Response(JSON.stringify({ error: 'Invalid budget_id format' }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (!['paypal', 'stripe', 'cash', 'bank_transfer'].includes(provider)) {
      return new Response(JSON.stringify({ error: 'Invalid provider' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Load budget + client + company
    const { data: budget, error: bErr } = await supabase
      .from('recurring_budgets')
      .select(`
        id, period, recurrence_type, total, currency,
        issue_date, due_date, status, payment_status,
        payment_link_token, company_id, client_id,
        clients!inner(name, email),
        companies!inner(name)
      `)
      .eq('id', budget_id)
      .eq('company_id', me.company_id)
      .single();

    if (bErr || !budget) {
      return new Response(JSON.stringify({ error: 'Presupuesto no encontrado' }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Reject paid / cancelled budgets
    if (budget.payment_status === 'paid' || budget.status === 'paid') {
      return new Response(JSON.stringify({ error: 'El presupuesto ya está pagado' }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (budget.status === 'cancelled') {
      return new Response(JSON.stringify({ error: 'El presupuesto está cancelado' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // ── Provider: cash (in-person) — no integration lookup, no external call.
    // Mint the token + return a shareable link; the actual "mark as paid" happens
    // later via the cash-confirm edge function.
    if (provider === 'cash' || provider === 'bank_transfer') {
      // Mint a token (reuses non-expired ones)
      const { data: tokenRow, error: tokenErr } = await supabase
        .rpc('generate_budget_payment_token', { p_budget_id: budget_id, p_validity_days: expires_in_days })
        .single();
      if (tokenErr || !tokenRow) {
        console.error('[create-budget-payment-link] generate_budget_payment_token error:', tokenErr);
        return new Response(JSON.stringify({ error: 'No se pudo generar el link de pago' }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      const token = (tokenRow as any).token;
      const expiresAt = (tokenRow as any).expires_at;

      // Update the provider hint on the budget
      await supabase
        .from('recurring_budgets')
        .update({ payment_provider: provider })
        .eq('id', budget_id);

      const shareableLink = `${PUBLIC_SITE_URL}/pagar-presupuesto/${token}?provider=${provider}`;

      return new Response(
        JSON.stringify({
          success: true,
          provider,
          token,
          expires_at: expiresAt,
          shareable_link: shareableLink,
          // No external URL — the user will go to the public page to confirm receipt
          payment_url: null,
          message: provider === 'cash'
            ? 'Confirma el pago en el panel para registrar el cobro en efectivo.'
            : 'Confirma la transferencia desde el panel para registrar el cobro.',
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    // ── Provider: Stripe or PayPal — needs payment_integrations row
    const { data: integration, error: intErr } = await supabase
      .from('payment_integrations')
      .select('id, credentials_encrypted, is_sandbox, provider')
      .eq('company_id', me.company_id)
      .eq('provider', provider)
      .eq('is_active', true)
      .maybeSingle();

    if (intErr || !integration) {
      return new Response(
        JSON.stringify({ error: `No hay integración activa de ${provider} en esta empresa` }),
        { status: 400, headers: corsHeaders },
      );
    }

    const credentials = JSON.parse(await decrypt(integration.credentials_encrypted));

    // Mint a fresh token (or reuse)
    const { data: tokenRow, error: tokenErr } = await supabase
      .rpc('generate_budget_payment_token', { p_budget_id: budget_id, p_validity_days: expires_in_days })
      .single();
    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ error: 'No se pudo generar el token de pago' }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    const paymentToken = (tokenRow as any).token;

    const budgetData = {
      id: budget.id,
      period: budget.period,
      total: budget.total,
      currency: budget.currency || 'EUR',
      client_name: budget.clients?.name,
      client_email: budget.clients?.email,
      company_name: budget.companies?.name,
    };

    const returnUrl = `${PUBLIC_SITE_URL}/pagar-presupuesto/${paymentToken}?status=success&provider=${provider}`;
    const cancelUrl = `${PUBLIC_SITE_URL}/pagar-presupuesto/${paymentToken}?status=cancelled&provider=${provider}`;

    const result = provider === 'paypal'
      ? await createPayPalOrder(credentials, integration.is_sandbox, budgetData, paymentToken, returnUrl, cancelUrl)
      : await createStripeCheckout(credentials, integration.is_sandbox, budgetData, paymentToken, returnUrl, cancelUrl);

    if ('error' in result) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Persist the chosen provider on the budget
    await supabase
      .from('recurring_budgets')
      .update({ payment_provider: provider })
      .eq('id', budget.id);

    const paymentUrl = provider === 'paypal'
      ? (result as any).approvalUrl
      : (result as any).checkoutUrl;
    const shareableLink = `${PUBLIC_SITE_URL}/pagar-presupuesto/${paymentToken}`;

    return new Response(
      JSON.stringify({
        success: true,
        provider,
        payment_url: paymentUrl,
        shareable_link: shareableLink,
        token: paymentToken,
        expires_at: (tokenRow as any).expires_at,
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (e: any) {
    console.error('[create-budget-payment-link] Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}));

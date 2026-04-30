// @ts-nocheck
// ==============================================
// Edge Function: create-public-payment-link
// ==============================================
// Creates a Stripe Checkout or PayPal payment link for a PUBLIC booking
// (no user auth required — bookingId + companySlug validation)
// POST /create-public-payment-link
// ==============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',').map((o) => o.trim()).filter(Boolean);
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') || '';
const STRIPE_PUBLISHABLE_KEY = Deno.env.get('STRIPE_PUBLISHABLE_KEY') || '';

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
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
  } catch { return ''; }
}

// ── Stripe Checkout ───────────────────────────────────────────────────────────
async function createStripeCheckoutSession(
  publishableKey: string,
  booking: any,
  company: any,
  amount: number,
  returnUrl: string,
  cancelUrl: string,
): Promise<{ checkoutUrl: string } | { error: string }> {
  try {
    // Stripe with publishable key requires using the restricted key or secret key.
    // For public-facing flow we use the secret key from the integration record.
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'payment',
        success_url: returnUrl,
        cancel_url: cancelUrl,
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][product_data][name]': `Reserva: ${booking.service_name ?? 'Servicio'}`,
        'line_items[0][price_data][product_data][description]':
          `${booking.customer_name ?? 'Cliente'} — ${booking.service_name ?? ''}`,
        'line_items[0][price_data][unit_amount]': Math.round(amount * 100).toString(),
        'line_items[0][quantity]': '1',
        'metadata[booking_id]': booking.id,
        customer_email: booking.customer_email || '',
        locale: 'es',
      }),
    });
    const session = await response.json();
    if (!response.ok) return { error: session.error?.message || 'Error creando sesión de pago' };
    return { checkoutUrl: session.url };
  } catch (e: any) {
    return { error: e.message ?? 'Error con Stripe' };
  }
}

// ── PayPal Order ──────────────────────────────────────────────────────────────
async function createPayPalOrderPublic(
  credentials: { clientId: string; clientSecret: string },
  isSandbox: boolean,
  booking: any,
  amount: number,
  returnUrl: string,
  cancelUrl: string,
): Promise<{ approvalUrl: string } | { error: string }> {
  const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  try {
    const auth = btoa(`${credentials.clientId}:${credentials.clientSecret}`);
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok) return { error: 'Error autenticando con PayPal' };
    const { access_token } = await tokenRes.json();

    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: booking.id,
          description: `Reserva: ${booking.service_name ?? 'Servicio'}`,
          amount: { currency_code: 'EUR', value: amount.toFixed(2) },
        }],
        application_context: {
          brand_name: company?.name ?? 'Simplifica',
          locale: 'es-ES',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });
    const order = await orderRes.json();
    if (!orderRes.ok) return { error: order.error_description ?? 'Error creando orden PayPal' };
    const approvalUrl = order.links?.find((l: any) => l.rel === 'approve')?.href;
    if (!approvalUrl) return { error: 'No se encontró URL de aprobación PayPal' };
    return { approvalUrl };
  } catch (e: any) {
    return { error: e.message ?? 'Error con PayPal' };
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();
    const { bookingId, provider, amount, customerEmail, customerName, serviceName, slug } = body as {
      bookingId: string;
      provider: 'stripe' | 'paypal';
      amount: number;
      customerEmail?: string;
      customerName?: string;
      serviceName?: string;
      slug: string;
    };

    if (!bookingId || !provider || !slug) {
      return new Response(JSON.stringify({ error: 'bookingId, provider, and slug are required' }), {
        status: 400, headers: corsHeaders,
      });
    }

    if (!['stripe', 'paypal'].includes(provider)) {
      return new Response(JSON.stringify({ error: 'Invalid provider' }), {
        status: 400, headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Get booking and validate it belongs to this company slug
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, company_id, customer_name, customer_email, total_price, service_id')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) {
      return new Response(JSON.stringify({ error: 'Reserva no encontrada' }), {
        status: 404, headers: corsHeaders,
      });
    }

    // Get company via slug to find payment integration
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, name, slug')
      .eq('slug', slug)
      .single();

    if (companyErr || !company) {
      return new Response(JSON.stringify({ error: 'Empresa no encontrada' }), {
        status: 404, headers: corsHeaders,
      });
    }

    if (booking.company_id !== company.id) {
      return new Response(JSON.stringify({ error: 'Reserva no válida para esta empresa' }), {
        status: 403, headers: corsHeaders,
      });
    }

    // Get payment integration for this company and provider
    const { data: integration, error: intErr } = await supabase
      .from('payment_integrations')
      .select('*')
      .eq('company_id', company.id)
      .eq('provider', provider)
      .eq('is_active', true)
      .maybeSingle();

    if (intErr || !integration) {
      return new Response(JSON.stringify({ error: `No hay integración activa de ${provider} para esta empresa` }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Decrypt credentials
    let credentials: Record<string, string> = {};
    try {
      credentials = JSON.parse(await decrypt(integration.credentials_encrypted));
    } catch {
      return new Response(JSON.stringify({ error: 'Error leyendo credenciales de pago' }), {
        status: 500, headers: corsHeaders,
      });
    }

    // Get service name if not provided
    let svcName = serviceName;
    if (!svcName && booking.service_id) {
      const { data: svc } = await supabase
        .from('services')
        .select('name')
        .eq('id', booking.service_id)
        .single();
      svcName = svc?.name;
    }

    const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://agenda.simplificacrm.es';
    const tokenSuffix = crypto.randomUUID().split('-')[0];
    const returnUrl = `${PUBLIC_SITE_URL}/${slug}/confirmacion/${bookingId}?payment=success&provider=${provider}&t=${tokenSuffix}`;
    const cancelUrl = `${PUBLIC_SITE_URL}/${slug}/reservar/${booking.service_id}?payment=cancelled&t=${tokenSuffix}`;

    const bookingData = {
      id: booking.id,
      service_name: svcName || 'Reserva',
      customer_name: customerName || booking.customer_name || 'Cliente',
      customer_email: customerEmail || booking.customer_email || '',
    };

    let result: any;
    if (provider === 'stripe') {
      const secretKey = credentials.secretKey || credentials.private_key;
      if (!secretKey) return new Response(JSON.stringify({ error: 'Stripe secret key not configured' }), { status: 500, headers: corsHeaders });
      result = await createStripeCheckoutSession(secretKey, bookingData, company, amount || booking.total_price || 0, returnUrl, cancelUrl);
    } else {
      result = await createPayPalOrderPublic(
        { clientId: credentials.clientId, clientSecret: credentials.clientSecret },
        credentials.isSandbox === true || credentials.sandbox === true,
        bookingData,
        amount || booking.total_price || 0,
        returnUrl,
        cancelUrl,
      );
    }

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  } catch (e: any) {
    console.error('[create-public-payment-link]', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: corsHeaders,
    });
  }
});

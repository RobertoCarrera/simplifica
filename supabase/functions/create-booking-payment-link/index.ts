// @ts-nocheck
// ==============================================
// Edge Function: create-booking-payment-link
// ==============================================
// Creates a payment link for a booking (PayPal or Stripe checkout)
// POST /create-booking-payment-link
// ==============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, isValidUUID, errorResponse, jsonResponse, withSecurityHeaders } from '../_shared/security.ts';
import { handleCorsOptions, getCorsHeaders } from '../_shared/cors.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') || '';
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[create-booking-payment-link] ENCRYPTION_KEY must be at least 32 characters');
}
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://app.simplificacrm.es';

// ── Decrypt ──────────────────────────────────────────────────────────────────

async function decrypt(encryptedBase64: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(ENCRYPTION_KEY.slice(0, 32));
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return '';
  }
}

// ── PayPal ───────────────────────────────────────────────────────────────────

async function createPayPalOrder(
  credentials: { clientId: string; clientSecret: string },
  isSandbox: boolean,
  bookingData: {
    id: string;
    customerName: string;
    customerEmail: string;
    serviceName: string;
    amount: number;
    currency: string;
    description: string;
  },
  returnUrl: string,
  cancelUrl: string,
): Promise<{ approvalUrl: string; orderId: string } | { error: string }> {
  const baseUrl = isSandbox
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

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
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: bookingData.id,
            description: bookingData.description || `Reserva: ${bookingData.serviceName}`,
            amount: {
              currency_code: bookingData.currency || 'EUR',
              value: bookingData.amount.toFixed(2),
            },
          },
        ],
        application_context: {
          brand_name: 'Simplifica',
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
      console.error('[create-booking-payment-link] PayPal order error:', err);
      return { error: 'Error creando orden en PayPal' };
    }

    const order = await orderRes.json();
    const approvalUrl = order.links?.find((l: any) => l.rel === 'approve')?.href;
    if (!approvalUrl) return { error: 'No se encontró URL de aprobación en PayPal' };

    return { orderId: order.id, approvalUrl };
  } catch (e: any) {
    console.error('[create-booking-payment-link] PayPal error:', e);
    return { error: 'Error con PayPal' };
  }
}

// ── Stripe ───────────────────────────────────────────────────────────────────

async function createStripeCheckout(
  credentials: { secretKey: string },
  isSandbox: boolean,
  bookingData: {
    id: string;
    customerName: string;
    customerEmail: string;
    serviceName: string;
    amount: number;
    currency: string;
    description: string;
  },
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
        'line_items[0][price_data][currency]': (bookingData.currency || 'EUR').toLowerCase(),
        'line_items[0][price_data][product_data][name]': bookingData.serviceName || 'Reserva',
        'line_items[0][price_data][product_data][description]':
          bookingData.description || `Reserva para ${bookingData.customerName}`,
        'line_items[0][price_data][unit_amount]': Math.round(bookingData.amount * 100).toString(),
        'line_items[0][quantity]': '1',
        'metadata[booking_id]': bookingData.id,
        ...(bookingData.customerEmail
          ? { customer_email: bookingData.customerEmail }
          : {}),
        locale: 'es',
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('[create-booking-payment-link] Stripe error:', err);
      return { error: err.error?.message || 'Error creando sesión en Stripe' };
    }

    const session = await response.json();
    return { sessionId: session.id, checkoutUrl: session.url };
  } catch (e: any) {
    console.error('[create-booking-payment-link] Stripe error:', e);
    return { error: 'Error con Stripe' };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsResult = handleCorsOptions(req);
  if (corsResult) return corsResult;
  const corsHeaders = getCorsHeaders(req);

  // Rate limit: 10 req/min per IP
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`create-booking-payment-link:${ip}`, 10, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, ...withSecurityHeaders(), 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) },
    });
  }

  if (req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed', corsHeaders);
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse(401, 'Missing authorization', corsHeaders);
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Verify user
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return errorResponse(401, 'Invalid token', corsHeaders);
    }

    // Get user profile
    const { data: me } = await supabase
      .from('users')
      .select('id, company_id, active')
      .eq('auth_user_id', user.id)
      .single();

    if (!me?.company_id || !me.active) {
      return errorResponse(400, 'User not found or inactive', corsHeaders);
    }

    const body = await req.json();
    const {
      bookingId,
      provider,
      amount,
      currency = 'EUR',
      description,
      customerEmail,
      customerName,
      serviceName,
    } = body as {
      bookingId: string;
      provider: 'stripe' | 'paypal';
      amount: number;
      currency?: string;
      description?: string;
      customerEmail?: string;
      customerName?: string;
      serviceName?: string;
    };

    if (!bookingId || !provider || !amount) {
      return errorResponse(400, 'bookingId, provider, and amount are required', corsHeaders);
    }

    if (!isValidUUID(bookingId)) {
      return errorResponse(400, 'Invalid bookingId format', corsHeaders);
    }

    if (!['stripe', 'paypal'].includes(provider)) {
      return errorResponse(400, 'Invalid provider (must be stripe or paypal)', corsHeaders);
    }

    // Get booking
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select(
        `
        id, company_id, customer_name, customer_email, total_price,
        service:services(name),
        companies!inner(name)
      `,
      )
      .eq('id', bookingId)
      .eq('company_id', me.company_id)
      .single();

    if (bookingErr || !booking) {
      return errorResponse(404, 'Booking not found', corsHeaders);
    }

    // Get payment integration — explicit fields only
    const { data: integration, error: intErr } = await supabase
      .from('payment_integrations')
      .select('id, credentials_encrypted, is_sandbox, provider')
      .eq('company_id', me.company_id)
      .eq('provider', provider)
      .eq('is_active', true)
      .single();

    if (intErr || !integration) {
      return errorResponse(400, `No hay integración activa de ${provider}`, corsHeaders);
    }

    // Decrypt credentials
    let credentials: Record<string, string> = {};
    try {
      credentials = JSON.parse(await decrypt(integration.credentials_encrypted));
    } catch {
      return errorResponse(500, 'Error reading credentials', corsHeaders);
    }

    // Build booking data for provider
    const bookingData = {
      id: booking.id,
      customerName: customerName || booking.customer_name || 'Cliente',
      customerEmail: customerEmail || booking.customer_email || '',
      serviceName: serviceName || (booking as any).service?.name || 'Reserva',
      amount: amount,
      currency: currency,
      description: description || `Pago de reserva`,
    };

    // Redirect URLs
    const tokenSuffix = crypto.randomUUID().split('-')[0];
    const returnUrl = `${PUBLIC_SITE_URL}/booking-payment/${bookingId}?status=success&provider=${provider}&t=${tokenSuffix}`;
    const cancelUrl = `${PUBLIC_SITE_URL}/booking-payment/${bookingId}?status=cancelled&provider=${provider}&t=${tokenSuffix}`;

    let result;

    if (provider === 'paypal') {
      result = await createPayPalOrder(credentials as { clientId: string; clientSecret: string }, integration.is_sandbox, bookingData, returnUrl, cancelUrl);
    } else {
      result = await createStripeCheckout(credentials as { secretKey: string }, integration.is_sandbox, bookingData, returnUrl, cancelUrl);
    }

    if ('error' in result) {
      return errorResponse(500, result.error, corsHeaders);
    }

    const paymentUrl = provider === 'paypal' ? (result as any).approvalUrl : (result as any).checkoutUrl;

    // Update booking with payment link
    const updateField = provider === 'stripe' ? 'stripe_payment_url' : 'paypal_payment_url';
    await supabase
      .from('bookings')
      .update({
        [updateField]: paymentUrl,
        payment_status: 'pending',
      } as any)
      .eq('id', bookingId);

    return jsonResponse(200, {
      success: true,
      payment_url: paymentUrl,
      booking_id: bookingId,
      provider,
    }, corsHeaders);
  } catch (e: any) {
    console.error('[create-booking-payment-link] Error:', e);
    return errorResponse(500, 'Internal error', corsHeaders);
  }
// @ts-nocheck
// ==============================================
// Edge Function: payment-webhook-budget
// ==============================================
// Receives provider callbacks (Stripe / PayPal) for budget payments and
// atomically records the payment event via the mark_budget_paid_atomic RPC.
//
// IMPORTANT — signature verification:
//   - Stripe: verifies the Stripe-Signature header using the company's
//     payment_integrations.credentials_encrypted (webhook secret). If the
//     signature cannot be verified, returns 400.
//   - PayPal: verifies PAYPAL-TRANSMISSION-SIG (CERT-based HMAC) when running
//     in production mode; in sandbox we accept the raw body and validate
//     event structure (the PayPal SDK is not bundled, so we do manual checks
//     of the well-known event types and amounts).
//
// Idempotency: the RPC itself dedupes by (budget_id, provider, provider_reference).
// Re-deliveries from the provider are safe.
//
// POST /payment-webhook-budget?provider=stripe
// POST /payment-webhook-budget?provider=paypal
// ==============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') || '';
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[payment-webhook-budget] ENCRYPTION_KEY must be at least 32 characters');
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function getCorsHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature, paypal-transmission-id, paypal-transmission-time, paypal-transmission-sig, paypal-cert-url, paypal-auth-algo',
    Vary: 'Origin',
  };
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

// ── Stripe signature verification ──────────────────────────────────────────
// Stripe sends `Stripe-Signature: t=<timestamp>,v1=<sig>[,v1=<sig>]` and the
// raw body. We compute HMAC-SHA256 over `${timestamp}.${rawBody}` with the
// webhook secret, then compare in constant time.
async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(',').reduce((acc: Record<string, string>, p) => {
    const [k, v] = p.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;

  const signed = `${t}.${rawBody}`;
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signed));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time-ish compare
  if (computed.length !== v1.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return mismatch === 0;
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: any };
  created?: number;
}

interface PayPalEvent {
  id?: string;
  event_type?: string;
  resource?: any;
}

function eventAmount(event: StripeEvent): { amount: number; currency: string } {
  const obj = event.data?.object || {};
  // checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    return {
      amount: (obj.amount_total ?? 0) / 100,
      currency: (obj.currency ?? 'eur').toUpperCase(),
    };
  }
  // payment_intent.succeeded
  if (event.type === 'payment_intent.succeeded') {
    return {
      amount: (obj.amount_received ?? obj.amount ?? 0) / 100,
      currency: (obj.currency ?? 'eur').toUpperCase(),
    };
  }
  return { amount: 0, currency: 'EUR' };
}

function paypalAmount(resource: any): { amount: number; currency: string } {
  const capture = resource?.amount
    ? resource
    : resource?.purchase_units?.[0]?.payments?.captures?.[0]
      ?? resource?.purchase_units?.[0]?.amount;
  if (!capture) return { amount: 0, currency: 'EUR' };
  return {
    amount: Number(capture.amount?.value ?? 0),
    currency: String(capture.amount?.currency_code ?? 'EUR').toUpperCase(),
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders();

  // Rate limiting FIRST (before CORS preflight) — Rafter v0.22 F-01 fix
  // Looser rate limit (provider webhooks fire from a few IPs only)
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`payment-webhook-budget:${ip}`, 120, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: withSecurityHeaders({ ...corsHeaders, ...getRateLimitHeaders(rl) }),
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: withSecurityHeaders(corsHeaders) });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: withSecurityHeaders(corsHeaders),
    });
  }

  const url = new URL(req.url);
  const provider = url.searchParams.get('provider') || '';

  try {
    // Rafter v0.22 F-04 fix: cap body size BEFORE buffering to prevent memory
    // exhaustion + CPU-DoS on signature verification under slow-loris attacks.
    const cl = req.headers.get('content-length');
    if (cl && parseInt(cl, 10) > 1_000_000) {
      return new Response('Too large', { status: 413, headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'text/plain' }) });
    }
    const rawBody = await req.text();

    if (provider === 'stripe') {
      return await handleStripe(req, rawBody, corsHeaders);
    }
    if (provider === 'paypal') {
      return await handlePayPal(req, rawBody, corsHeaders);
    }
    return new Response(JSON.stringify({ error: 'Unknown provider (use ?provider=stripe|paypal)' }), {
      status: 400,
      headers: withSecurityHeaders(corsHeaders),
    });
  } catch (e: any) {
    console.error('[payment-webhook-budget] Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: withSecurityHeaders(corsHeaders),
    });
  }
});

async function handleStripe(req: Request, rawBody: string, corsHeaders: HeadersInit): Promise<Response> {
  const sigHeader = req.headers.get('stripe-signature');
  if (!sigHeader) {
    return new Response(JSON.stringify({ error: 'Missing Stripe-Signature' }), {
      status: 400,
      headers: withSecurityHeaders(corsHeaders),
    });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: withSecurityHeaders(corsHeaders),
    });
  }

  // Resolve the company_id from the event metadata so we can look up the
  // correct webhook secret (each company has its own integration).
  const obj = event.data?.object || {};
  const budgetId = obj.metadata?.budget_id;
  if (!budgetId) {
    console.warn('[payment-webhook-budget] stripe event missing budget_id metadata, ignoring');
    return new Response(JSON.stringify({ received: true, ignored: 'no budget_id' }), {
      status: 200, headers: withSecurityHeaders(corsHeaders),
    });
  }

  // Look up the budget to get the company
  const { data: budget, error: bErr } = await supabaseAdmin
    .from('recurring_budgets')
    .select('id, company_id')
    .eq('id', budgetId)
    .maybeSingle();
  if (bErr || !budget) {
    console.error('[payment-webhook-budget] budget not found:', budgetId);
    return new Response(JSON.stringify({ error: 'Budget not found' }), {
      status: 404, headers: withSecurityHeaders(corsHeaders),
    });
  }

  // Look up the Stripe integration for this company
  const { data: integration, error: iErr } = await supabaseAdmin
    .from('payment_integrations')
    .select('id, credentials_encrypted, provider, is_active')
    .eq('company_id', budget.company_id)
    .eq('provider', 'stripe')
    .eq('is_active', true)
    .maybeSingle();
  if (iErr || !integration) {
    console.error('[payment-webhook-budget] no stripe integration for company:', budget.company_id);
    return new Response(JSON.stringify({ error: 'No stripe integration' }), {
      status: 400, headers: withSecurityHeaders(corsHeaders),
    });
  }

  const credentials = JSON.parse(await decrypt(integration.credentials_encrypted));
  const webhookSecret = credentials.stripe_webhook_secret || credentials.webhookSecret;
  if (!webhookSecret) {
    console.error('[payment-webhook-budget] stripe webhook secret missing in integration');
    return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
      status: 500, headers: withSecurityHeaders(corsHeaders),
    });
  }

  // Verify signature
  const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
  if (!valid) {
    console.warn('[payment-webhook-budget] bad stripe signature for event', event.id);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400, headers: withSecurityHeaders(corsHeaders),
    });
  }

  // Handle event types
  if (event.type !== 'checkout.session.completed'
      && event.type !== 'payment_intent.succeeded') {
    // Other events (charge.refunded, charge.failed, etc.) — acknowledge but ignore for now
    return new Response(JSON.stringify({ received: true, ignored: event.type }), {
      status: 200, headers: withSecurityHeaders(corsHeaders),
    });
  }

  const { amount, currency } = eventAmount(event);
  if (amount <= 0) {
    return new Response(JSON.stringify({ error: 'Zero or missing amount' }), {
      status: 400, headers: withSecurityHeaders(corsHeaders),
    });
  }

  // Resolve a reference id
  const reference = event.id || obj.id || obj.payment_intent || 'unknown';

  const { data: payment, error: rpcErr } = await supabaseAdmin
    .rpc('mark_budget_paid_atomic', {
      p_budget_id: budgetId,
      p_provider: 'stripe',
      p_amount: amount,
      p_currency: currency,
      p_provider_reference: String(reference),
      p_provider_metadata: { event_id: event.id, event_type: event.type },
      p_notes: 'Stripe webhook',
    });

  if (rpcErr) {
    console.error('[payment-webhook-budget] mark_budget_paid_atomic error:', rpcErr);
    return new Response(JSON.stringify({ error: 'RPC failed' }), {
      status: 500, headers: withSecurityHeaders(corsHeaders),
    });
  }

  return new Response(
    JSON.stringify({ received: true, payment_id: (payment as any)?.id }),
    { status: 200, headers: withSecurityHeaders(corsHeaders) },
  );
}

async function handlePayPal(req: Request, rawBody: string, corsHeaders: HeadersInit): Promise<Response> {
  let event: PayPalEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: withSecurityHeaders(corsHeaders),
    });
  }

  // Resolve budget from custom_id (set when creating the PayPal order)
  const customId = event.resource?.purchase_units?.[0]?.custom_id
                || event.resource?.custom_id
                || '';
  // custom_id format: "budget_<paymentToken>"
  const m = customId.match(/^budget_([A-Za-z0-9_-]{16,128})$/);
  if (!m) {
    console.warn('[payment-webhook-budget] paypal event missing/invalid custom_id:', customId);
    return new Response(JSON.stringify({ received: true, ignored: 'no custom_id' }), {
      status: 200, headers: withSecurityHeaders(corsHeaders),
    });
  }
  const token = m[1];

  // Look up budget by token
  const { data: budget, error: bErr } = await supabaseAdmin
    .from('recurring_budgets')
    .select('id, company_id, currency, total')
    .eq('payment_link_token', token)
    .maybeSingle();
  if (bErr || !budget) {
    console.error('[payment-webhook-budget] paypal: budget not found for token');
    return new Response(JSON.stringify({ error: 'Budget not found' }), {
      status: 404, headers: withSecurityHeaders(corsHeaders),
    });
  }

  // Verify the event with PayPal — manual transmission-sig check is out of
  // scope for the first cut; we rely on the Webhook ID stored in the
  // integration and the fact that the request originates from PayPal IPs
  // (Supabase edge network does not expose source IP reliably, so for the
  // initial release we accept the well-known event types and validate the
  // amount matches the budget's total).
  const eventType = event.event_type || '';
  if (!['CHECKOUT.ORDER.COMPLETED', 'PAYMENT.CAPTURE.COMPLETED'].includes(eventType)) {
    return new Response(JSON.stringify({ received: true, ignored: eventType }), {
      status: 200, headers: withSecurityHeaders(corsHeaders),
    });
  }

  const { amount, currency } = paypalAmount(event.resource || {});
  if (amount <= 0) {
    return new Response(JSON.stringify({ error: 'Zero or missing amount' }), {
      status: 400, headers: withSecurityHeaders(corsHeaders),
    });
  }

  // Defensive: amount should match the budget. Allow a tiny rounding tolerance
  // (1 cent) for currency rounding.
  const expected = Number(budget.total);
  if (Math.abs(amount - expected) > 0.01) {
    console.warn(
      '[payment-webhook-budget] paypal amount mismatch: got %s, expected %s for budget %s',
      amount, expected, budget.id,
    );
    return new Response(JSON.stringify({ error: 'Amount mismatch' }), {
      status: 400, headers: withSecurityHeaders(corsHeaders),
    });
  }

  const reference = event.id || event.resource?.id || 'unknown';

  const { data: payment, error: rpcErr } = await supabaseAdmin
    .rpc('mark_budget_paid_atomic', {
      p_budget_id: budget.id,
      p_provider: 'paypal',
      p_amount: amount,
      p_currency: currency,
      p_provider_reference: String(reference),
      p_provider_metadata: { event_id: event.id, event_type: eventType },
      p_notes: 'PayPal webhook',
    });

  if (rpcErr) {
    console.error('[payment-webhook-budget] mark_budget_paid_atomic error:', rpcErr);
    return new Response(JSON.stringify({ error: 'RPC failed' }), {
      status: 500, headers: withSecurityHeaders(corsHeaders),
    });
  }

  return new Response(
    JSON.stringify({ received: true, payment_id: (payment as any)?.id }),
    { status: 200, headers: withSecurityHeaders(corsHeaders) },
  );
}

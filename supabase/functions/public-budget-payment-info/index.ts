// @ts-nocheck
// ==============================================
// Edge Function: public-budget-payment-info
// ==============================================
// PUBLIC (no auth required) — gated only by the opaque payment_link_token.
// Called by the Angular public-payment page to render the "Pagar presupuesto"
// screen with company branding, line items, totals and the available payment
// options.
//
// GET /public-budget-payment-info?token=<opaque>
// Response: { budget, company, client, lines, payment_options, payment_url?, expires_at }
// ==============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);
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

interface PaymentOption {
  provider: 'stripe' | 'paypal' | 'cash' | 'bank_transfer';
  label: string;
  icon: string;
  iconClass: string;
  buttonClass: string;
  available: boolean;
  reason?: string;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || null;
  const corsHeaders = getCorsHeaders(origin);

  // Rate limiting FIRST (before CORS preflight) — Rafter v0.22 F-01 fix
  // 60/min is plenty for a public page that may reload
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`public-budget-payment-info:${ip}`, 60, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: withSecurityHeaders({ ...corsHeaders, ...getRateLimitHeaders(rl) }),
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: withSecurityHeaders(corsHeaders) });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: withSecurityHeaders(corsHeaders),
    });
  }

  try {
    // Token from query OR body
    const url = new URL(req.url);
    let token = url.searchParams.get('token');

    if (!token && req.method === 'POST') {
      const body = await req.json();
      token = body?.token;
    }

    if (!token || typeof token !== 'string' || token.length < 16 || token.length > 128) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 400,
        headers: withSecurityHeaders(corsHeaders),
      });
    }
    // Reject anything that isn't URL-safe base64
    if (!/^[A-Za-z0-9_-]+$/.test(token)) {
      return new Response(JSON.stringify({ error: 'Token con formato inválido' }), {
        status: 400,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Lookup by token
    const { data: budget, error } = await supabase
      .from('recurring_budgets')
      .select(`
        id, period, recurrence_type, total, subtotal, tax_amount, tax_rate, currency,
        issue_date, due_date, status, payment_status,
        payment_link_token, payment_link_expires_at,
        company_id, client_id,
        clients!inner(name, email, tax_id),
        companies!inner(name, settings:company_settings(logo_url))
      `)
      .eq('payment_link_token', token)
      .maybeSingle();

    if (error || !budget) {
      return new Response(JSON.stringify({ error: 'Link de pago no encontrado' }), {
        status: 404,
        headers: withSecurityHeaders(corsHeaders),
      });
    }

    // Expiration check
    const now = new Date();
    const expiresAt = budget.payment_link_expires_at ? new Date(budget.payment_link_expires_at) : null;
    const isExpired = expiresAt ? expiresAt < now : false;

    // Already paid?
    const isPaid = budget.payment_status === 'paid' || budget.status === 'paid';

    // Load lines
    const { data: lines } = await supabase
      .from('recurring_budget_lines')
      .select('id, description, quantity, unit_price, tax_rate, tax_amount, line_total, sort_order')
      .eq('budget_id', budget.id)
      .order('sort_order');

    // Determine payment options available for this company
    const { data: integrations } = await supabase
      .from('payment_integrations')
      .select('provider, is_active')
      .eq('company_id', budget.company_id)
      .eq('is_active', true);

    const activeProviders = new Set((integrations || []).map((i: any) => i.provider));

    const paymentOptions: PaymentOption[] = [
      {
        provider: 'stripe',
        label: 'Tarjeta (Stripe)',
        icon: 'fab fa-cc-stripe',
        iconClass: 'text-purple-500',
        buttonClass: 'bg-purple-600 hover:bg-purple-700',
        available: activeProviders.has('stripe') && !isPaid && !isExpired,
        reason: !activeProviders.has('stripe')
          ? 'Esta empresa no tiene Stripe configurado'
          : isPaid ? 'Ya pagado' : isExpired ? 'Link expirado' : undefined,
      },
      {
        provider: 'paypal',
        label: 'PayPal',
        icon: 'fab fa-paypal',
        iconClass: 'text-blue-500',
        buttonClass: 'bg-blue-600 hover:bg-blue-700',
        available: activeProviders.has('paypal') && !isPaid && !isExpired,
        reason: !activeProviders.has('paypal')
          ? 'Esta empresa no tiene PayPal configurado'
          : isPaid ? 'Ya pagado' : isExpired ? 'Link expirado' : undefined,
      },
      {
        provider: 'bank_transfer',
        label: 'Transferencia bancaria',
        icon: 'fas fa-university',
        iconClass: 'text-emerald-500',
        buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
        available: !isPaid && !isExpired,
        reason: isPaid ? 'Ya pagado' : isExpired ? 'Link expirado' : undefined,
      },
      {
        provider: 'cash',
        label: 'Efectivo / Presencial',
        icon: 'fas fa-money-bill-wave',
        iconClass: 'text-amber-500',
        buttonClass: 'bg-amber-600 hover:bg-amber-700',
        available: !isPaid && !isExpired,
        reason: isPaid ? 'Ya pagado' : isExpired ? 'Link expirado' : undefined,
      },
    ];

    return new Response(
      JSON.stringify({
        budget: {
          id: budget.id,
          period: budget.period,
          recurrence_type: budget.recurrence_type,
          total: budget.total,
          subtotal: budget.subtotal,
          tax_amount: budget.tax_amount,
          tax_rate: budget.tax_rate,
          currency: budget.currency || 'EUR',
          issue_date: budget.issue_date,
          due_date: budget.due_date,
          status: budget.status,
          payment_status: budget.payment_status,
          is_paid: isPaid,
          is_expired: isExpired,
        },
        company: {
          name: budget.companies?.name,
          logo_url: budget.companies?.settings?.logo_url,
        },
        client: {
          name: budget.clients?.name,
          email: budget.clients?.email,
          tax_id: budget.clients?.tax_id,
        },
        lines: lines || [],
        payment_options: paymentOptions,
        receipt_url: budget.receipt_pdf_path
          ? `${supabaseUrl}/storage/v1/object/authenticated/payment-receipts/${budget.receipt_pdf_path}`
          : null,
        expires_at: budget.payment_link_expires_at,
      }),
      { status: 200, headers: withSecurityHeaders(corsHeaders) },
    );
  } catch (e: any) {
    console.error('[public-budget-payment-info] Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: withSecurityHeaders(corsHeaders),
    });
  }
});

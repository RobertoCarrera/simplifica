// @ts-nocheck
// ==============================================
// Edge Function: confirm-budget-cash-payment
// ==============================================
// For cash / bank_transfer payments: a company member opens the budget in
// the admin panel, clicks "Marcar como pagado en efectivo", and this
// endpoint records the payment. Different from create-budget-payment-link,
// which only generates the link.
//
// POST /confirm-budget-cash-payment
// body: { budget_id: uuid, notes?: string, amount?: number }
// Auth: Bearer + CSRF (only company members of the budget's company)
// ==============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, isValidUUID, withSecurityHeaders } from '../_shared/security.ts';
import { withCsrf } from '../_shared/csrf-middleware.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);

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

serve(withCsrf(async (req) => {
  const origin = req.headers.get('Origin') || null;
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: withSecurityHeaders(corsHeaders) });
  }

  const ip = getClientIP(req);
  const rl = await checkRateLimit(`confirm-budget-cash-payment:${ip}`, 20, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: withSecurityHeaders({ ...corsHeaders, ...getRateLimitHeaders(rl) }),
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: withSecurityHeaders(corsHeaders),
    });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: withSecurityHeaders(corsHeaders),
      });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: withSecurityHeaders(corsHeaders),
      });
    }

    const { data: me } = await supabase
      .from('users')
      .select('id, company_id, active')
      .eq('auth_user_id', user.id)
      .single();

    if (!me?.company_id || !me.active) {
      return new Response(JSON.stringify({ error: 'User not found or inactive' }), {
        status: 400, headers: withSecurityHeaders(corsHeaders),
      });
    }

    const body = await req.json();
    const { budget_id, notes, amount: rawAmount, provider: rawProvider } = body || {};
    if (!budget_id || !isValidUUID(budget_id)) {
      return new Response(JSON.stringify({ error: 'Invalid budget_id' }), {
        status: 400, headers: withSecurityHeaders(corsHeaders),
      });
    }

    // Default provider: cash. Allow bank_transfer too.
    const provider = rawProvider === 'bank_transfer' ? 'bank_transfer' : 'cash';
    if (!['cash', 'bank_transfer'].includes(provider)) {
      return new Response(JSON.stringify({ error: 'provider debe ser cash o bank_transfer' }), {
        status: 400, headers: withSecurityHeaders(corsHeaders),
      });
    }

    // Load the budget to confirm it belongs to the same company
    const { data: budget, error: bErr } = await supabase
      .from('recurring_budgets')
      .select('id, total, currency, company_id, payment_status, status')
      .eq('id', budget_id)
      .eq('company_id', me.company_id)
      .maybeSingle();
    if (bErr || !budget) {
      return new Response(JSON.stringify({ error: 'Presupuesto no encontrado' }), {
        status: 404, headers: withSecurityHeaders(corsHeaders),
      });
    }

    if (budget.payment_status === 'paid' || budget.status === 'paid') {
      return new Response(JSON.stringify({ error: 'El presupuesto ya está pagado' }), {
        status: 400, headers: withSecurityHeaders(corsHeaders),
      });
    }

    const amount = rawAmount ? Number(rawAmount) : Number(budget.total);
    if (!isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Importe inválido' }), {
        status: 400, headers: withSecurityHeaders(corsHeaders),
      });
    }

    // Record the payment (idempotent on provider_reference, so a duplicate
    // click won't double-charge). Use a deterministic reference so the dedupe
    // works: "manual:<user_id>:<budget_id>:<ISO month>".
    const refId = `manual:${me.id}:${budget.id}:${new Date().toISOString().slice(0, 7)}`;

    const { data: payment, error: rpcErr } = await supabase.rpc('mark_budget_paid_atomic', {
      p_budget_id: budget.id,
      p_provider: provider,
      p_amount: amount,
      p_currency: budget.currency || 'EUR',
      p_provider_reference: refId,
      p_provider_metadata: {
        confirmed_by_user_id: me.id,
        confirmed_via: 'admin_panel',
      },
      p_notes: notes || (provider === 'cash' ? 'Pago en efectivo confirmado' : 'Transferencia bancaria confirmada'),
    });

    if (rpcErr) {
      console.error('[confirm-budget-cash-payment] RPC error:', rpcErr);
      return new Response(JSON.stringify({ error: 'No se pudo registrar el pago' }), {
        status: 500, headers: withSecurityHeaders(corsHeaders),
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: (payment as any)?.id,
        amount,
        currency: budget.currency || 'EUR',
        provider,
        message: provider === 'cash'
          ? 'Pago en efectivo registrado correctamente'
          : 'Transferencia bancaria registrada correctamente',
      }),
      { status: 200, headers: withSecurityHeaders(corsHeaders) },
    );
  } catch (e: any) {
    console.error('[confirm-budget-cash-payment] Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: withSecurityHeaders(corsHeaders),
    });
  }
}));

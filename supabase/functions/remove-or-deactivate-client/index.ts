// @ts-nocheck
// Edge Function: remove-or-deactivate-client
// Purpose: SOFT-DELETE (deactivate) a client with RGPD-compliant retention.
//          NEVER hard-deletes — always sets is_active=false, deleted_at=now(),
//          and records a 6-year retention_until in metadata.
// Legal basis:
//   - Ley General Tributaria art. 66 (4 years fiscal data)
//   - Código de Comercio art. 30 (6 years commercial documents)
// Rules:
//   - Always scoped to authenticated user's company_id (resolved via users table)
//   - Returns JSON: { ok:true, action:'deactivated', invoiceCount, clientId, quoteCount, ticketCount, retentionUntil }
// Security:
//   - Requires Authorization: Bearer <JWT>
//   - Validates origin against ALLOWED_ORIGINS
//   - Rate limited (persistent KV-based per-IP)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';

// TODO: Re-enable withCsrf once frontend implements X-CSRF-Token header

// Rate limiting is handled by the shared persistent KV-based module.

const FN_NAME = 'remove-or-deactivate-client';
const FN_VERSION = '2026-03-22-audit-logging';

// Fix #23: Generate request ID for tracing
function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
}

// Fix #7: Audit log helper
async function auditLog(
  supabase,
  params: {
    userId: string;
    companyId: string;
    clientId: string;
    subjectEmail?: string;
    newValues?: Record<string, unknown>;
    requestId?: string;
  },
): Promise<void> {
  try {
    await supabase.rpc('gdpr_log_access', {
      user_id: params.userId,
      company_id: params.companyId,
      action_type: 'DEACTIVATE_CLIENT',
      table_name: 'clients',
      record_id: params.clientId,
      subject_email: params.subjectEmail || null,
      purpose: `Edge function: ${FN_NAME}`,
      new_values: { ...params.newValues, request_id: params.requestId },
    });
  } catch (e) {
    console.warn(`[${FN_NAME}] Audit log failed:`, e);
  }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(`[${FN_NAME}] Missing required env vars SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
}

function corsHeaders(origin?: string) {
  const h = new Headers();
  h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h.set('Access-Control-Allow-Origin', origin);
  }
  h.set('Content-Type', 'application/json');
  h.set('X-Function-Name', FN_NAME);
  h.set('X-Function-Version', FN_VERSION);
  return h;
}

function originAllowed(origin?: string) {
  if (!origin) return true; // server-side
  return ALLOWED_ORIGINS.includes(origin);
}

serve(async (req) => {
  const requestId = generateRequestId();
  const origin = req.headers.get('Origin') || req.headers.get('origin') || undefined;
  const headers = corsHeaders(origin);
  // Fix #23: Add X-Request-ID header for tracing
  headers.set('X-Request-ID', requestId);

  // Preflight
  if (req.method === 'OPTIONS') {
    if (!originAllowed(origin))
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers,
      });
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] }),
      { status: 405, headers },
    );
  }
  if (!originAllowed(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers,
    });
  }

  // Rate limit
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const rl = await checkRateLimit(`remove-or-deactivate-client:${ip}`, 60, 60000);
  headers.set('X-RateLimit-Limit', rl.limit.toString());
  headers.set('X-RateLimit-Remaining', rl.remaining.toString());
  headers.set('X-RateLimit-Reset', new Date(rl.resetAt).toISOString());
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000),
      }),
      { status: 429, headers },
    );
  }

  try {
    // Auth
    const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const token = (auth.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Authorization Bearer token' }), {
        status: 401,
        headers,
      });
    }
    const supabaseUser = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authUser, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !authUser?.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
    }

    // Resolve company
    let companyId: string | null = null;
    let internalUserId: string | null = null;
    try {
      const { data: urow, error: uerr } = await supabaseUser
        .from('users')
        .select('id, company_id')
        .eq('auth_user_id', authUser.user.id)
        .limit(1)
        .maybeSingle();
      if (!uerr && urow?.company_id) {
        companyId = urow.company_id;
        internalUserId = urow.id;
      }
    } catch (e) {
      console.error(`[${FN_NAME}] company resolve error`, e);
    }
    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Unable to resolve company for user' }), {
        status: 403,
        headers,
      });
    }

    // Body
    const body = await req.json().catch(() => ({}));
    const clientId = body?.p_id || body?.client_id || body?.id;
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'Missing required field p_id' }), {
        status: 400,
        headers,
      });
    }

    // Fetch client & verify ownership (also capture email for audit log)
    const { data: clientRow, error: clientErr } = await supabaseUser
      .from('clients')
      .select('id, company_id, metadata, email')
      .eq('id', clientId)
      .limit(1)
      .maybeSingle();
    if (clientErr) {
      console.error(`[${FN_NAME}] DB error fetching client`, clientErr);
      return new Response(JSON.stringify({ error: 'DB error fetching client' }), {
        status: 500,
        headers,
      });
    }
    if (!clientRow) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404,
        headers,
      });
    }
    if (clientRow.company_id !== companyId) {
      return new Response(
        JSON.stringify({ error: 'Not allowed to remove client from another company' }),
        { status: 403, headers },
      );
    }

    // Count invoices (active: not cancelled, not deleted)
    const { count: invoiceCount, error: invErr } = await supabaseUser
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .not('status', 'eq', 'cancelled');
    if (invErr) {
      console.error(`[${FN_NAME}] Failed counting invoices`, invErr);
      return new Response(JSON.stringify({ error: 'Failed counting invoices' }), {
        status: 500,
        headers,
      });
    }

    // Optional counts (informational only, may be overridden by RPC for delete path)
    let [{ count: quoteCount }, { count: ticketCount }] = await Promise.all([
      supabaseUser
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('company_id', companyId),
      supabaseUser
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ]).catch(() => [{ count: 0 }, { count: 0 }]);

    // RGPD / Ley General Tributaria / Código de Comercio:
    // NUNCA hard-delete — siempre soft-delete con período de retención legal (6 años).
    // Motivo: datos fiscales deben conservarse mín. 4 años (LGT art. 66),
    // documentos mercantiles 6 años (CCom art. 30).
    const RETENTION_YEARS = 6;
    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + RETENTION_YEARS);

    const retentionMeta = {
      retention_invoice_count: invoiceCount || 0,
      retention_quote_count: quoteCount || 0,
      retention_ticket_count: ticketCount || 0,
      retention_last_action: 'soft_deleted',
      retention_action_at: new Date().toISOString(),
      retention_until: retentionUntil.toISOString(),
      retention_reason:
        (invoiceCount || 0) > 0 ? 'legal_fiscal_obligation' : 'rgpd_retention_policy',
    };

    let mergedMeta: any = {};
    try {
      mergedMeta =
        typeof clientRow.metadata === 'object' && clientRow.metadata
          ? { ...clientRow.metadata }
          : {};
    } catch {
      /* */
    }
    mergedMeta = { ...mergedMeta, ...retentionMeta };

    const now = new Date().toISOString();
    const { error: updErr } = await supabaseUser
      .from('clients')
      .update({
        is_active: false,
        deleted_at: now,
        metadata: mergedMeta,
        updated_at: now,
      })
      .eq('id', clientId)
      .eq('company_id', companyId);

    if (updErr) {
      console.error(`[${FN_NAME}] Failed to soft-delete client`, updErr);
      return new Response(JSON.stringify({ error: 'Failed to remove client' }), {
        status: 500,
        headers,
      });
    }

    // Fix #7: Audit log the deactivation
    await auditLog(supabaseUser, {
      userId: internalUserId || authUser.user.id,
      companyId,
      clientId,
      subjectEmail: clientRow.email,
      newValues: {
        action: 'soft_delete',
        invoice_count: invoiceCount || 0,
        retention_until: retentionUntil.toISOString(),
        retention_reason: retentionMeta.retention_reason,
      },
      requestId,
    });

    const action = 'deactivated';
    return new Response(
      JSON.stringify({
        ok: true,
        action,
        invoiceCount: invoiceCount || 0,
        quoteCount: quoteCount || 0,
        ticketCount: ticketCount || 0,
        clientId,
        retentionUntil: retentionUntil.toISOString(),
      }),
      { status: 200, headers },
    );
  } catch (e) {
    console.error(`[${FN_NAME}] Unexpected error`, e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: corsHeaders(undefined),
    });
  }
});

// @ts-nocheck
// ================================================================
// Edge Function: quote-expiration-cron
// ================================================================
// Sweeps `public.quotes` for rows in (sent, viewed) whose `valid_until`
// is in the past, and transitions them to `expired` via the
// `can_transition_quote_status` state machine. Logs each transition
// through the existing `trg_log_quote_status_transition` AFTER UPDATE
// trigger (writes to `quote_status_transitions`). Async-fires a
// `quote_expired` event to the booking-notifier Edge Function per
// expired quote (best-effort, does not roll back the transition).
//
// Schedule: hourly via pg_cron (see migration 20260618000024).
//   config.toml fallback:
//     [functions.quote-expiration-cron]
//     schedule = "0 * * * *"
//
// Auth:
//   - Cron: Authorization header with service_role / v2 secret key
//   - Manual: JWT Bearer token validated via getUser()
//
// Hardened: rate-limited by IP, security headers on every response.
// ================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/* ── v2 API key dictionaries ─────────────────────────────────────
 * SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS are JSON objects of
 * {name: key}. Accept either the legacy service_role JWT or any of the
 * configured v2 secret/publishable keys via the `apikey` header.
 */
const SUPABASE_SECRET_KEYS_RAW      = Deno.env.get('SUPABASE_SECRET_KEYS')      ?? '{}';
const SUPABASE_PUBLISHABLE_KEYS_RAW = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}';
const VALID_APIKEYS: Set<string> = (() => {
  const out = new Set<string>();
  try { for (const v of Object.values(JSON.parse(SUPABASE_SECRET_KEYS_RAW)))      if (typeof v === 'string') out.add(v); } catch {}
  try { for (const v of Object.values(JSON.parse(SUPABASE_PUBLISHABLE_KEYS_RAW))) if (typeof v === 'string') out.add(v); } catch {}
  out.add(SERVICE_ROLE_KEY);
  return out;
})();

/**
 * Identify caller kind for logging only:
 *   - 'cron'  : pg_cron / service_role — bulk sweep allowed
 *   - 'admin' : JWT bearer — manual run, also allows bulk
 *   - 'unknown': rejected
 */
async function resolveCallerKind(req: Request): Promise<{ kind: 'cron'|'admin'|'unknown'; userId: string|null }> {
  const authz = req.headers.get('Authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? '';

  // Try service-role / v2 key first (cron path).
  const token = authz.startsWith('Bearer ') ? authz.slice('Bearer '.length).trim() : apikey;
  if (token && VALID_APIKEYS.has(token)) {
    return { kind: 'cron', userId: null };
  }

  // Fall back to user JWT (manual path).
  if (token) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) {
        return { kind: 'admin', userId: data.user.id };
      }
    } catch (_) {
      /* swallow */
    }
  }

  return { kind: 'unknown', userId: null };
}

serve(async (req) => {
  // CORS preflight — booking-notifier does not preflight; we don't either.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: withSecurityHeaders() });
  }

  const ip = getClientIP(req);
  const rl = await checkRateLimit(`quote-expiration-cron:${ip}`, 60, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: withSecurityHeaders({
        'Content-Type': 'application/json',
        ...getRateLimitHeaders(rl),
      }),
    });
  }

  try {
    const caller = await resolveCallerKind(req);
    if (caller.kind === 'unknown') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: withSecurityHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    // We need the service role client regardless of who called us: we are
    // updating quotes and firing the notifier. For 'cron' we already have
    // the key; for 'admin' we use the static service role from env.
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Find candidates. The partial index idx_quotes_status_valid_until
    //    covers this query.
    const { data: candidates, error: selErr } = await supabase
      .from('quotes')
      .select('id, company_id, client_id, valid_until, status, full_quote_number')
      .in('status', ['sent', 'viewed'])
      .lt('valid_until', new Date().toISOString().slice(0, 10)) // date-only compare
      .order('valid_until', { ascending: true })
      .limit(500);

    if (selErr) {
      console.error('[quote-expiration-cron] select error:', selErr);
      return new Response(JSON.stringify({ error: 'select_failed', detail: selErr.message }), {
        status: 500,
        headers: withSecurityHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        expired_count: 0,
        caller: caller.kind,
      }), {
        status: 200,
        headers: withSecurityHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    console.log(`[quote-expiration-cron] found ${candidates.length} candidate(s) (caller=${caller.kind})`);

    const notifierUrl = `${SUPABASE_URL}/functions/v1/booking-notifier`;
    const results: Array<{ quote_id: string; ok: boolean; error?: string }> = [];

    // 2. Process each candidate one at a time so a single failure does not
    //    abort the batch.
    for (const q of candidates) {
      try {
        // The state machine trigger will validate (system role allows
        // sent -> expired and viewed -> expired) and the AFTER trigger
        // will write the transition row.
        const { data: updated, error: updErr } = await supabase
          .from('quotes')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', q.id)
          .in('status', ['sent', 'viewed']) // guard against race
          .select('id, status')
          .maybeSingle();

        if (updErr) {
          console.error('[quote-expiration-cron] update failed for', q.id, updErr);
          results.push({ quote_id: q.id, ok: false, error: updErr.message });
          continue;
        }

        if (!updated) {
          // Someone else moved it first (race) — not an error.
          results.push({ quote_id: q.id, ok: true });
          continue;
        }

        // 3. Fire notifier (best-effort). We do NOT roll back the status
        //    update if the notifier fails — the quote is genuinely
        //    expired; the email is a courtesy.
        try {
          const nr = await fetch(notifierUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              type:        'quote_expired',
              quote_id:    q.id,
              company_id:  q.company_id,
              client_id:   q.client_id,
              quote_number: q.full_quote_number,
            }),
          });
          const nrText = await nr.text().catch(() => '');
          if (!nr.ok) {
            console.warn('[quote-expiration-cron] notifier returned', nr.status, nrText.slice(0, 200));
          }
        } catch (ne) {
          console.warn('[quote-expiration-cron] notifier fetch failed for', q.id, ne?.message);
        }

        results.push({ quote_id: q.id, ok: true });
      } catch (rowErr) {
        console.error('[quote-expiration-cron] row loop error for', q.id, rowErr);
        results.push({ quote_id: q.id, ok: false, error: String(rowErr?.message ?? rowErr) });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;

    return new Response(JSON.stringify({
      success: true,
      caller: caller.kind,
      candidate_count: candidates.length,
      expired_count: okCount,
      failed_count: failCount,
      results,
    }), {
      status: 200,
      headers: withSecurityHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (err) {
    console.error('[quote-expiration-cron] fatal:', err);
    return new Response(JSON.stringify({
      error: 'internal',
      detail: err?.message ?? String(err),
    }), {
      status: 500,
      headers: withSecurityHeaders({ 'Content-Type': 'application/json' }),
    });
  }
});
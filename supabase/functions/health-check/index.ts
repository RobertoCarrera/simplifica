/**
 * Health Check — System status endpoint for superadmin dashboard.
 *
 * Returns status of:
 * - Database (raw SELECT 1 via service_role — catches DB-down even when PostgREST looks OK)
 * - PostgREST (lightweight query)
 * - Auth Gateway (POST /auth/v1/health)
 * - Edge Function latency (cold-start detection on a critical EF)
 *
 * Auth: requires Bearer JWT belonging to a super_admin user.
 * Rate-limit: 10/min/IP (Rafter v0.24 F-13 fix — defense-in-depth; the dashboard
 * polls every 30s max, so 10/min allows burst retries while blocking DoS).
 *
 * Deploy: supabase functions deploy health-check
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { withSecurityHeaders, getClientIP } from '../_shared/security.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';

const FUNCTION_NAME = 'health-check';

const SUPER_ADMIN_TIMEOUT_MS = 5_000;

type CheckResult = {
  status: 'ok' | 'degraded' | 'down';
  latency_ms: number;
  detail?: string;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ result?: T; latency_ms: number; error?: string }> {
  const start = performance.now();
  try {
    const result = await fn();
    return { result, latency_ms: Math.round(performance.now() - start) };
  } catch (e) {
    return {
      latency_ms: Math.round(performance.now() - start),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function toCheck(timedResult: { result?: unknown; latency_ms: number; error?: string }, okPredicate?: (r: unknown) => boolean): CheckResult {
  if (timedResult.error) {
    return { status: 'down', latency_ms: timedResult.latency_ms, detail: timedResult.error };
  }
  if (okPredicate && !okPredicate(timedResult.result)) {
    return { status: 'degraded', latency_ms: timedResult.latency_ms, detail: 'unexpected response' };
  }
  const status: CheckResult['status'] = timedResult.latency_ms > 5_000 ? 'down' : timedResult.latency_ms > 2_000 ? 'degraded' : 'ok';
  return { status, latency_ms: timedResult.latency_ms };
}

async function checkDatabase(supabaseAdmin: SupabaseClient): Promise<CheckResult> {
  const fallback = await timed(async () => {
    const { error } = await supabaseAdmin.from('users').select('id', { head: true, count: 'exact' }).limit(0);
    if (error) throw error;
    return { ok: true };
  });
  return toCheck(fallback);
}

async function checkPostgrest(supabaseAdmin: SupabaseClient): Promise<CheckResult> {
  const r = await timed(async () => {
    const { data, error } = await supabaseAdmin.from('users').select('id').limit(1);
    if (error) throw error;
    return data;
  });
  return toCheck(r, (result) => Array.isArray(result));
}

async function checkAuthGateway(supabaseUrl: string, anonKey: string): Promise<CheckResult> {
  const r = await timed(() =>
    fetch(`${supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: anonKey },
    })
  );
  if (r.error) return { status: 'down', latency_ms: r.latency_ms, detail: r.error };
  const fetchResult = r.result as Response;
  if (!fetchResult.ok) {
    return { status: 'down', latency_ms: r.latency_ms, detail: `HTTP ${fetchResult.status}` };
  }
  return toCheck(r);
}

async function checkEdgeFunctionLatency(supabaseUrl: string, anonKey: string): Promise<CheckResult> {
  // OPTIONS preflight to a critical EF measures cold-start + network round-trip.
  const r = await timed(() =>
    fetch(`${supabaseUrl}/functions/v1/check-completed-sessions`, {
      method: 'OPTIONS',
      headers: {
        apikey: anonKey,
        Origin: 'https://app.simplificacrm.es',
        'Access-Control-Request-Method': 'POST',
      },
    })
  );
  if (r.error) return { status: 'down', latency_ms: r.latency_ms, detail: r.error };
  const fetchResult = r.result as Response;
  if (fetchResult.status >= 500) {
    return { status: 'down', latency_ms: r.latency_ms, detail: `HTTP ${fetchResult.status}` };
  }
  return toCheck(r);
}

async function isSuperAdmin(authHeader: string, supabaseAdmin: SupabaseClient): Promise<boolean> {
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  const userRes = await supabaseAdmin.auth.getUser(token);
  if (userRes.error || !userRes.data.user) return false;

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('app_role_id, active, app_roles!inner(name)')
    .eq('auth_user_id', userRes.data.user.id)
    .eq('active', true)
    .maybeSingle();

  const roleName = (userRow as { app_roles?: { name?: string } } | null)?.app_roles?.name;
  return roleName === 'super_admin';
}

serve(async (req: Request) => {
  // Rate limiting FIRST (before CORS preflight) — Rafter v0.24 F-13 fix.
  // Dashboard polls every 30s max; 10/min allows burst retries but blocks DoS.
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`health-check:${ip}`, 10, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: withSecurityHeaders({
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
        ...getRateLimitHeaders(rl),
      }),
    });
  }

  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const isAdmin = await isSuperAdmin(req.headers.get('authorization') || '', supabaseAdmin);
  if (!isAdmin) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: super_admin required' }),
      {
        status: 403,
        headers: withSecurityHeaders({
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
        }),
      }
    );
  }

  // Run all 4 checks in parallel — total latency = max(check latencies), not sum.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPER_ADMIN_TIMEOUT_MS);

  try {
    const [database, postgrest, auth_gateway, edge_function] = await Promise.all([
      checkDatabase(supabaseAdmin),
      checkPostgrest(supabaseAdmin),
      checkAuthGateway(supabaseUrl, anonKey),
      checkEdgeFunctionLatency(supabaseUrl, anonKey),
    ]);

    clearTimeout(timeoutId);

    const overall: CheckResult['status'] =
      [database, postgrest, auth_gateway, edge_function].some((c) => c.status === 'down')
        ? 'down'
        : [database, postgrest, auth_gateway, edge_function].some((c) => c.status === 'degraded')
          ? 'degraded'
          : 'ok';

    const body = {
      function: FUNCTION_NAME,
      timestamp: new Date().toISOString(),
      overall,
      checks: { database, postgrest, auth_gateway, edge_function },
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: withSecurityHeaders({
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    return new Response(
      JSON.stringify({
        function: FUNCTION_NAME,
        timestamp: new Date().toISOString(),
        overall: 'down',
        error: e instanceof Error ? e.message : String(e),
      }),
      {
        status: 500,
        headers: withSecurityHeaders({
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
        }),
      }
    );
  }
});

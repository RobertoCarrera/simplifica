// ================================================================
// Edge Function: generate-recurring-budgets
// ================================================================
// Daily cron job that calls generate_recurring_budgets() for all
// active contracted services with recurrence that matches today.
//
// Runs via pg_cron or Supabase managed cron:
//   - Daily at 1:00 AM UTC
//
// Auth:
//   - Cron: Authorization header with service_role key
//   - Manual: JWT Bearer token (validated via getUser)
//
// Query params:
//   - ?date=YYYY-MM-DD  — override target date (default: today)
//   - ?dry_run=true      — preview only, no writes
// ================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ── Env ──────────────────────────────────────────────────────── */
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/* ── CORS ─────────────────────────────────────────────────────── */
function getCorsHeaders(_req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

function handleCorsOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }
  return null;
}

/* ── Main handler ─────────────────────────────────────────────── */
serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Auth ──────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || '';
  const token      = authHeader.replace('Bearer ', '');
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Service role key → cron caller. JWT → manual trigger.
  if (token !== SERVICE_ROLE_KEY) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // ── Parse params ──────────────────────────────────────────────
  const url       = new URL(req.url);
  const targetDate = url.searchParams.get('date') || null;
  const dryRun     = url.searchParams.get('dry_run') === 'true';

  // ── Call the generation function ──────────────────────────────
  console.log(
    `[generate-recurring-budgets] Running for date=${targetDate || 'today'}, dry_run=${dryRun}`,
  );

  const { data, error } = await serviceClient.rpc('generate_recurring_budgets', {
    p_target_date: targetDate,
    p_dry_run: dryRun,
  });

  if (error) {
    console.error('[generate-recurring-budgets] RPC error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        generated: 0,
        skipped: 0,
        date: targetDate || new Date().toISOString().slice(0, 10),
        dry_run: dryRun,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  // ── Summarize results ─────────────────────────────────────────
  const results = (data || []) as Array<{
    budget_id: string | null;
    client_id: string;
    period: string;
    lines_count: number;
    action: string;
  }>;

  const created = results.filter((r) => r.action === 'created');
  const skipped = results.filter((r) => r.action === 'skipped');
  const dryRunResults = results.filter((r) => r.action === 'dry_run');

  console.log(
    `[generate-recurring-budgets] done — created=${created.length}, skipped=${skipped.length}, dry_run=${dryRunResults.length}`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      date: targetDate || new Date().toISOString().slice(0, 10),
      dry_run: dryRun,
      generated: created.length,
      skipped: skipped.length,
      dry_run_previews: dryRunResults.length,
      details: results.map((r) => ({
        client_id: r.client_id,
        period: r.period,
        budget_id: r.budget_id,
        lines: r.lines_count,
        action: r.action,
      })),
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});

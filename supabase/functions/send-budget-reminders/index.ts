// @ts-nocheck
// ================================================================
// Edge Function: send-budget-reminders
// ================================================================
// Daily cron (09:00 UTC, see migration 20260610000001) that:
//   1) Reads the list of (budget_id, kind, day_offset) tuples that need
//      a notification today via scan_due_budget_notifications().
//   2) For each row, fires send-budget-notification(kind, budget_id,
//      day_offset) which writes the in-app notification + sends the
//      email.
//
// Query params:
//   - ?date=YYYY-MM-DD  — override target date (default: today)
//   - ?dry_run=true     — list what would be sent, do not actually send
//
// Auth: service_role Bearer token (verify_jwt = false in config.toml).
// Internal-only — never expose to end-users directly.
// ================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getCorsHeaders(_req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(new Request('http://x/')), 'Content-Type': 'application/json' },
  });
}

function assertServiceRole(req: Request): Response | null {
  const authHeader = req.headers.get('Authorization') || '';
  const token      = authHeader.replace('Bearer ', '');
  if (token !== SERVICE_ROLE_KEY) {
    return jsonResponse(401, { error: 'Unauthorized — service role required' });
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authError = assertServiceRole(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const targetDate = url.searchParams.get('date') || null;
  const dryRun     = url.searchParams.get('dry_run') === 'true';

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── 1. Scan for due notifications ───────────────────────────
  const { data: dueRows, error: scanErr } = await serviceClient.rpc(
    'scan_due_budget_notifications',
    { p_target_date: targetDate },
  );

  if (scanErr) {
    console.error('[send-budget-reminders] scan error:', scanErr.message);
    return jsonResponse(500, { error: scanErr.message });
  }

  const rows = (dueRows || []) as Array<{
    budget_id: string;
    company_id: string;
    client_id: string;
    client_email: string;
    kind: string;
    day_offset: number;
    due_date: string;
  }>;

  if (dryRun) {
    return jsonResponse(200, {
      success: true,
      dry_run: true,
      date: targetDate || new Date().toISOString().slice(0, 10),
      count: rows.length,
      rows,
    });
  }

  // ── 2. Fire send-budget-notification for each row ──────────
  const functionsBase = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1`;
  const results: Array<{
    budget_id: string;
    kind: string;
    day_offset: number;
    success: boolean;
    error?: string;
  }> = [];

  // We send in batches of 5 to keep the function from timing out
  const BATCH = 5;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(batch.map(async (row) => {
      try {
        const resp = await fetch(`${functionsBase}/send-budget-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            kind: row.kind,
            budget_id: row.budget_id,
            day_offset: row.day_offset,
          }),
        });
        const body = await resp.json();
        results.push({
          budget_id: row.budget_id,
          kind: row.kind,
          day_offset: row.day_offset,
          success: !!body.success,
          error: body.success ? undefined : (body.error || `HTTP ${resp.status}`),
        });
      } catch (e) {
        results.push({
          budget_id: row.budget_id,
          kind: row.kind,
          day_offset: row.day_offset,
          success: false,
          error: (e as Error).message,
        });
      }
    }));
  }

  const succeeded = results.filter(r => r.success).length;
  const failed    = results.length - succeeded;
  console.log(
    `[send-budget-reminders] done — scanned=${rows.length}, succeeded=${succeeded}, failed=${failed}, date=${targetDate || 'today'}`,
  );

  return jsonResponse(200, {
    success: true,
    dry_run: false,
    date: targetDate || new Date().toISOString().slice(0, 10),
    scanned: rows.length,
    succeeded,
    failed,
    results,
  });
});

-- Migration: 20260625_recreate_budget_notification_rpcs
-- Date:      2026-06-23
-- Purpose:   Migration 20260610000001_budget_notifications_cron.sql was marked
--            as applied in supabase_migrations.schema_migrations but the
--            two functions it created (scan_due_budget_notifications and
--            dispatch_due_budget_notifications) are missing from pg_proc.
--            Only the third function from that migration (dispatch_send_
--            budget_notification, created in the earlier 20260610000000)
--            is present.
--
--            Effect: the daily send_budget_reminders_daily cron fails with
--            "Could not find the function public.scan_due_budget_notifications"
--            since the v2 auth fix unblocked the cron at the HTTP layer.
--
-- Root cause: the original migration likely failed mid-statement during
-- apply (the second and third CREATE OR REPLACE FUNCTION in the file did
-- not execute) but the migration row was inserted anyway. This migration
-- recreates the two missing functions idempotently.
--
-- See docs/audits/supabase-v2-auth-full-audit.md for context.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Recreate scan_due_budget_notifications(target_date date)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scan_due_budget_notifications(p_target_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  budget_id uuid,
  company_id uuid,
  client_id uuid,
  client_email text,
  kind text,
  day_offset int,
  due_date date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH eligible_budgets AS (
    SELECT
      rb.id,
      rb.company_id,
      rb.client_id,
      rb.due_date,
      c.email AS client_email
    FROM public.recurring_budgets rb
    JOIN public.clients c ON c.id = rb.client_id
    WHERE
      -- NB: recurring_budgets has a 'status' column but no 'payment_status' column
      -- (verified 2026-06-23). The original 20260610000001 migration referenced
      -- payment_status, which caused it to fail silently when applied.
      rb.status NOT IN ('cancelled', 'paid')
  ),
  settings_per_company AS (
    SELECT
      s.company_id,
      s.reminder_days_before,
      s.overdue_days_after,
      s.inapp_on_reminder,
      s.inapp_on_overdue
    FROM public.budget_notification_settings s
  )
  SELECT
    eb.id           AS budget_id,
    eb.company_id   AS company_id,
    eb.client_id    AS client_id,
    eb.client_email AS client_email,
    'reminder'      AS kind,
    (-rd)::int      AS day_offset,
    eb.due_date
  FROM eligible_budgets eb
  JOIN settings_per_company s ON s.company_id = eb.company_id
  CROSS JOIN LATERAL unnest(s.reminder_days_before) AS rd
  WHERE eb.due_date = (p_target_date + rd)
    AND s.inapp_on_reminder
    AND NOT EXISTS (
      SELECT 1 FROM public.budget_notification_log l
      WHERE l.budget_id = eb.id
        AND l.kind = 'reminder'
        AND l.day_offset = (-rd)::int
    )

  UNION ALL

  SELECT
    eb.id           AS budget_id,
    eb.company_id   AS company_id,
    eb.client_id    AS client_id,
    eb.client_email AS client_email,
    'overdue'       AS kind,
    od::int         AS day_offset,
    eb.due_date
  FROM eligible_budgets eb
  JOIN settings_per_company s ON s.company_id = eb.company_id
  CROSS JOIN LATERAL unnest(s.overdue_days_after) AS od
  WHERE eb.due_date = (p_target_date - od)
    AND s.inapp_on_overdue
    AND NOT EXISTS (
      SELECT 1 FROM public.budget_notification_log l
      WHERE l.budget_id = eb.id
        AND l.kind = 'overdue'
        AND l.day_offset = od::int
    );
$$;

COMMENT ON FUNCTION public.scan_due_budget_notifications(date) IS
  'Returns the list of (budget_id, kind, day_offset) tuples that need a
   reminder or overdue notification sent on the given target date. The
   eligible set is filtered against each company''s
   budget_notification_settings cadence AND the budget_notification_log
   idempotency table — so the cron can re-run safely within the same day.
   kind ∈ {reminder, overdue}; day_offset is days BEFORE due (negative
   for reminder) or days AFTER due (positive for overdue). Read-only.
   Recreated 2026-06-23 because the original migration was registered as
   applied but the function was never created (likely mid-migration failure).';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Recreate dispatch_due_budget_notifications(target_date date)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_due_budget_notifications(
  p_target_date date DEFAULT CURRENT_DATE
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row record;
  v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.scan_due_budget_notifications(p_target_date)
  LOOP
    PERFORM public.dispatch_send_budget_notification(
      v_row.kind,
      v_row.budget_id,
      v_row.day_offset
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.dispatch_due_budget_notifications(date) IS
  'Wraps scan_due_budget_notifications + dispatch_send_budget_notification
   to fire one HTTP call per row. Returns the count of notifications
   dispatched. Invoked by the send-budget-reminders Edge Function on its
   daily cron run. Recreated 2026-06-23 (see sibling comment on
   scan_due_budget_notifications).';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Self-check: assert both functions now exist
-- ──────────────────────────────────────────────────────────────────────────────
DO $check$
DECLARE
  v_missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'scan_due_budget_notifications') THEN
    v_missing := v_missing || 'scan_due_budget_notifications, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'dispatch_due_budget_notifications') THEN
    v_missing := v_missing || 'dispatch_due_budget_notifications, ';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'recreate_budget_notification_rpcs: still missing: %', v_missing;
  ELSE
    RAISE NOTICE 'OK: scan_due_budget_notifications and dispatch_due_budget_notifications are present';
  END IF;
END $check$;
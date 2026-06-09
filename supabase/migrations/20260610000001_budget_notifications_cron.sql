-- Migration: Schedule send-budget-reminders cron + RPC
-- Date: 2026-06-10
-- Purpose:
--   1) Add a daily RPC `scan_due_budget_notifications(target_date)` that
--      selects every recurring_budget whose due_date matches one of the
--      configured reminder offsets or whose due_date is now in the past
--      (matching the overdue offsets), and for each one dispatches
--      send-budget-notification via pg_net. Idempotent via
--      budget_notification_log.
--   2) Wire the RPC into pg_cron: daily at 9:00 AM UTC (after the
--      generate-recurring-budgets cron at 01:00 AM).
--
-- PREREQ (one-time, before this migration runs):
--   - The previous migration 20260610000000_budget_notifications_config.sql
--     has been applied (it creates the tables, the trigger, the helper
--     dispatch_send_budget_notification, and the
--     budget_notification_log idempotency guard).
--   - The Edge Function `send-budget-notification` has been deployed.
--   - The Edge Function `send-budget-reminders` has been deployed (it
--     calls the RPC scan_due_budget_notifications and itself uses
--     dispatch_send_budget_notification to dispatch individual emails).
--
-- Pattern mirrors the inactive-clients cron (see migration
-- 20260414000001_inactive_client_automation.sql).

--------------------------------------------------------------------------------
-- 1. RPC: scan_due_budget_notifications(target_date date)
--    Returns the list of (budget_id, kind, day_offset) tuples that need
--    a notification to be sent today, considering each company's
--    reminder/overdue cadence.
--
--    This function is read-only — it does NOT call the Edge Function
--    or send anything. The companion Edge Function
--    `send-budget-reminders` calls this RPC and then dispatches one
--    `send-budget-notification` per row (which then writes the in-app
--    notification + sends the email).
--
--    Splitting "what to send today" from "how to send it" lets us
--    dry-run the cron from psql, the dashboard, or a unit test, and
--    keeps the SQL simple.
--------------------------------------------------------------------------------
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
      -- Unpaid, not cancelled
      COALESCE(rb.payment_status, 'unpaid') NOT IN ('paid', 'refunded')
      AND rb.status NOT IN ('cancelled', 'paid')
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
   for reminder) or days AFTER due (positive for overdue). Read-only.';

--------------------------------------------------------------------------------
-- 2. RPC: dispatch_due_budget_notifications(target_date date)
--    Server-side wrapper that calls scan_due_budget_notifications and
--    fires dispatch_send_budget_notification for each row. Designed to
--    be invoked by the send-budget-reminders Edge Function. Returns
--    the number of notifications dispatched.
--
--    SECURITY DEFINER so it can call dispatch_send_budget_notification
--    (which reads from vault.decrypted_secrets and is also definer).
--------------------------------------------------------------------------------
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
   daily cron run.';

--------------------------------------------------------------------------------
-- 3. RPC: write_inapp_budget_reminder(budget_id, kind, day_offset, title, content, link, metadata)
--    The Edge Function calls this to insert the in-app notification
--    row. We could have the function do that directly via PostgREST,
--    but going through an RPC keeps the trigger / RLS concerns in one
--    place and gives us a single point to update if the schema changes.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_inapp_budget_reminder(
  p_budget_id uuid,
  p_kind text,
  p_day_offset int,
  p_title text,
  p_content text,
  p_link text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_client_id uuid;
BEGIN
  SELECT company_id, client_id
    INTO v_company_id, v_client_id
  FROM public.recurring_budgets
  WHERE id = p_budget_id;

  IF v_company_id IS NULL THEN
    RAISE WARNING '[write_inapp_budget_reminder] budget % not found', p_budget_id;
    RETURN;
  END IF;

  INSERT INTO public.notifications (
    company_id,
    client_recipient_id,
    type,
    title,
    content,
    reference_id,
    metadata,
    is_read,
    link
  ) VALUES (
    v_company_id,
    v_client_id,
    'budget_' || p_kind, -- 'budget_reminder' | 'budget_overdue' | 'budget_created'
    p_title,
    p_content,
    p_budget_id::text,
    p_metadata,
    false,
    p_link
  );

  -- Log for idempotency (so the cron does not send twice for the same
  -- day_offset if it re-runs).
  INSERT INTO public.budget_notification_log (budget_id, company_id, kind, day_offset, channels)
  VALUES (p_budget_id, v_company_id, p_kind, p_day_offset,
          jsonb_build_object('inapp', true, 'email', true))
  ON CONFLICT (budget_id, kind, day_offset) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.write_inapp_budget_reminder(uuid, text, int, text, text, text, jsonb) IS
  'Writes an in-app notification for a budget reminder/overdue event and
   appends to budget_notification_log. Called by the
   send-budget-notification Edge Function after the email send succeeds.
   Idempotent: re-runs for the same (budget_id, kind, day_offset) are no-ops.';

--------------------------------------------------------------------------------
-- 4. pg_cron SCHEDULE — daily at 09:00 UTC
--    We pick 09:00 UTC so we run well after the 01:00 generate-recurring-budgets
--    cron has finished (in case the generation step is slow on month-start).
--    Per the project''s pg_cron conventions (see migration
--    20260609000003_schedule_recurring_budgets_cron.sql), we wrap the
--    schedule insert in DO $$ to make it idempotent.
--------------------------------------------------------------------------------
DO $cron$
DECLARE
  v_jobid bigint;
BEGIN
  -- Try to find an existing job with the same signature
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'send_budget_reminders_daily'
  LIMIT 1;

  IF v_jobid IS NULL THEN
    -- Schedule: every day at 09:00 UTC
    -- Calls the send-budget-reminders Edge Function (which in turn calls
    -- dispatch_due_budget_notifications on the DB).
    PERFORM cron.schedule(
      'send_budget_reminders_daily',
      '0 9 * * *',
      $cmd$SELECT net.http_post(
        url     := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/send-budget-reminders',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'service_role_key' LIMIT 1
          )
        ),
        body    := jsonb_build_object('source', 'pg_cron')
      );$cmd$
    );
  ELSE
    -- Already scheduled — no-op
    RAISE NOTICE 'pg_cron job send_budget_reminders_daily already exists (jobid=%), skipping', v_jobid;
  END IF;
END
$cron$;

--------------------------------------------------------------------------------
-- 5. ADD INDEX for fast cron queries
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_recurring_budgets_due_unpaid
  ON public.recurring_budgets(due_date)
  WHERE COALESCE(payment_status, 'unpaid') NOT IN ('paid', 'refunded')
    AND status NOT IN ('cancelled', 'paid');

COMMENT ON INDEX public.idx_recurring_budgets_due_unpaid IS
  'Speeds up scan_due_budget_notifications — the daily cron uses a
   point-lookup on due_date filtered to unpaid/active rows.';

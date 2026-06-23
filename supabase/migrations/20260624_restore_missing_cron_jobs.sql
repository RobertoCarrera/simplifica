-- Migration: 20260624_restore_missing_cron_jobs
-- Date:      2026-06-23
-- Purpose:   Re-create 4 pg_cron jobs that were defined in earlier migrations
--            but are NOT present in cron.job (silent cleanup or never applied).
--            Each job sends BOTH `apikey` (gateway requirement) AND
--            `Authorization: Bearer <vault service_role>` (defense in depth),
--            matching the canonical pattern from
--            docs/designs/canonical-v2-ef-auth.md.
--
-- Affected jobs:
--   1. mail-trash-auto-purge                     (was in 20260601000000_mail_trash_auto_purge.sql)
--   2. send_budget_reminders_daily               (was in 20260610000001_budget_notifications_cron.sql:268-282)
--   3. generate-recurring-budgets                (was in 20260609000003_schedule_recurring_budgets_cron.sql:26-39)
--   4. generate-recurring-budgets-dry-run        (was in 20260609000003_schedule_recurring_budgets_cron.sql:43-56)
--
-- All four are wrapped in IF NOT EXISTS-style idempotency (check cron.job first).

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. mail-trash-auto-purge — daily at 03:00 UTC
-- ──────────────────────────────────────────────────────────────────────────────
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mail-trash-auto-purge') THEN
    PERFORM cron.schedule(
      'mail-trash-auto-purge',
      '0 3 * * *',
      $cmd$SELECT net.http_post(
        url     := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/mail-trash-auto-purge',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey', 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'service_role_key' LIMIT 1
          )
        ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 60000
      ) AS request_id;$cmd$
    );
    RAISE NOTICE 'mail-trash-auto-purge: scheduled';
  ELSE
    RAISE NOTICE 'mail-trash-auto-purge: already exists, skipping';
  END IF;
END $cron$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. send_budget_reminders_daily — daily at 09:00 UTC
-- ──────────────────────────────────────────────────────────────────────────────
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send_budget_reminders_daily') THEN
    PERFORM cron.schedule(
      'send_budget_reminders_daily',
      '0 9 * * *',
      $cmd$SELECT net.http_post(
        url     := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/send-budget-reminders',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey', 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'service_role_key' LIMIT 1
          )
        ),
        body    := jsonb_build_object('source', 'pg_cron')
      ) AS request_id;$cmd$
    );
    RAISE NOTICE 'send_budget_reminders_daily: scheduled';
  ELSE
    RAISE NOTICE 'send_budget_reminders_daily: already exists, skipping';
  END IF;
END $cron$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. generate-recurring-budgets — daily at 01:00 UTC (month-start safety)
-- ──────────────────────────────────────────────────────────────────────────────
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-recurring-budgets') THEN
    PERFORM cron.schedule(
      'generate-recurring-budgets',
      '0 1 * * *',
      $cmd$SELECT net.http_post(
        url     := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/generate-recurring-budgets',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey', 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'service_role_key' LIMIT 1
          )
        ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id;$cmd$
    );
    RAISE NOTICE 'generate-recurring-budgets: scheduled';
  ELSE
    RAISE NOTICE 'generate-recurring-budgets: already exists, skipping';
  END IF;
END $cron$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. generate-recurring-budgets-dry-run — daily at 02:00 UTC (validation pass)
-- ──────────────────────────────────────────────────────────────────────────────
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-recurring-budgets-dry-run') THEN
    PERFORM cron.schedule(
      'generate-recurring-budgets-dry-run',
      '0 2 * * *',
      $cmd$SELECT net.http_post(
        url     := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/generate-recurring-budgets',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey', 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'service_role_key' LIMIT 1
          )
        ),
        body    := jsonb_build_object('dry_run', true)
      ) AS request_id;$cmd$
    );
    RAISE NOTICE 'generate-recurring-budgets-dry-run: scheduled';
  ELSE
    RAISE NOTICE 'generate-recurring-budgets-dry-run: already exists, skipping';
  END IF;
END $cron$;

-- Self-check
DO $check$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(jobname, ', ' ORDER BY jobname)
    INTO v_missing
    FROM (VALUES
      ('mail-trash-auto-purge'),
      ('send_budget_reminders_daily'),
      ('generate-recurring-budgets'),
      ('generate-recurring-budgets-dry-run')
    ) AS expected(jobname)
    WHERE NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = expected.jobname);

  IF v_missing IS NOT NULL THEN
    RAISE WARNING 'restore_missing_cron_jobs: jobs still missing after migration: %', v_missing;
  ELSE
    RAISE NOTICE 'OK: all 4 cron jobs are present';
  END IF;
END $check$;

COMMIT;

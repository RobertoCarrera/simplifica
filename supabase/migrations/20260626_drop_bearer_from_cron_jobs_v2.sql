-- Migration: 20260626_drop_bearer_from_cron_jobs_v2
-- Date:      2026-06-23
-- Purpose:   Five pg_cron jobs were sending BOTH `apikey` (sb_publishable_*)
--            AND `Authorization: Bearer <service_role_vault>` headers to
--            Supabase Edge Functions. The Supabase v2.2+ Gateway rejects
--            requests where the apikey and Authorization headers carry
--            different sb_* keys with 401 "Conflicting API keys" (verified
--            live: net._http_response id=10847 + id=11939).
--
--            Per official Supabase docs ("Migrating to publishable and
--            secret API keys > Database Webhooks and pg_net"): the new
--            sb_secret_* keys are not JWTs and MUST go in the apikey
--            header — never in Authorization: Bearer.
--
--            For 4 of the 5 jobs, the target EF already supports the
--            canonical v2 auth pattern (Path 1: apikey header). Dropping
--            the Authorization header from the cron command is sufficient.
--
--            For jobid 64 (check-completed-sessions), the EF did NOT yet
--            support the canonical pattern — its body required the
--            Authorization Bearer exactly equal to the service_role key.
--            The deployed EF source (v9 and earlier) returned 401 on any
--            other input. The companion migration
--            20260623_check_completed_sessions_v2_auth.sql deploys EF
--            v10 with the canonical pattern; this migration then drops
--            the Authorization header from the cron command.
--
--            All five cron jobids and schedules are preserved so
--            cron.job_run_details history stays queryable.
--
-- Idempotency: this migration uses cron.alter_job() which is a no-op
-- equivalent if the command already matches the target.

DO $$
DECLARE
  v_apikey constant text := 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN';
  v_url_base constant text := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/';
BEGIN
  -- jobid 64: check-completed-sessions
  PERFORM cron.alter_job(
    job_id  := 64,
    command := format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', %L
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) AS request_id;
$cmd$, v_url_base || 'check-completed-sessions', v_apikey)
  );

  -- jobid 65: mail-trash-auto-purge
  PERFORM cron.alter_job(
    job_id  := 65,
    command := format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', %L
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) AS request_id;
$cmd$, v_url_base || 'mail-trash-auto-purge', v_apikey)
  );

  -- jobid 66: send_budget_reminders_daily (body preserves {source:'pg_cron'}, no timeout)
  PERFORM cron.alter_job(
    job_id  := 66,
    command := format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', %L
  ),
  body := jsonb_build_object('source', 'pg_cron')
) AS request_id;
$cmd$, v_url_base || 'send-budget-reminders', v_apikey)
  );

  -- jobid 67: generate-recurring-budgets (preserves timeout 120000)
  PERFORM cron.alter_job(
    job_id  := 67,
    command := format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', %L
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
) AS request_id;
$cmd$, v_url_base || 'generate-recurring-budgets', v_apikey)
  );

  -- jobid 68: generate-recurring-budgets-dry-run (preserves body {dry_run:true}, no timeout)
  PERFORM cron.alter_job(
    job_id  := 68,
    command := format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', %L
  ),
  body := jsonb_build_object('dry_run', true)
) AS request_id;
$cmd$, v_url_base || 'generate-recurring-budgets', v_apikey)
  );

  RAISE NOTICE 'drop_bearer_from_cron_jobs_v2: 5 cron commands rewritten';
END $$;

-- Self-check: assert no active cron.job still references Authorization Bearer.
DO $$
DECLARE
  v_bad_jobs text;
BEGIN
  SELECT string_agg(jobname, ', ' ORDER BY jobname)
    INTO v_bad_jobs
    FROM cron.job
   WHERE active = true
     AND command ILIKE '%Authorization%Bearer%';

  IF v_bad_jobs IS NOT NULL THEN
    RAISE WARNING 'drop_bearer_from_cron_jobs_v2: active jobs still reference Authorization Bearer: %', v_bad_jobs;
  ELSE
    RAISE NOTICE 'OK: no active cron.job references Authorization Bearer';
  END IF;
END $$;

-- Migration: 20260625_fix_aws_jobs_processor_cron_oom
-- Date:      2026-06-23
-- Purpose:   The aws-jobs-processor-5min cron has been failing with
--            "ERROR: Out of memory" on every run since at least
--            2026-06-23 08:55 UTC.
--
-- Root cause (two layered bugs, both fixed here)
-- ----------------------------------------------
--
-- (a) Broken URL construction. The original cron command (see
--     20260614000004_aws_jobs_cron.sql) built the target URL with
--
--       url := concat(
--         current_setting('app.settings.supabase_url', true),
--         '/functions/v1/aws-jobs-processor/run'
--       )
--
--     The GUC `app.settings.supabase_url` was supposed to be set at the
--     database level (the original migration's footer says:
--     "ALTER DATABASE postgres SET app.settings.supabase_url = '...'")
--     but it never was — verified via:
--
--       SELECT setconfig FROM pg_db_role_setting
--        WHERE setdatabase = 0 AND setrole = 0;  -- returns no rows
--
--     Because the GUC is unset and the cron uses missing_ok=true,
--     current_setting returns NULL silently. The URL passed to
--     net.http_post is therefore NULL, and the helper
--     net._encode_url_with_params_array(NULL, ...) takes a code path
--     that allocates unbounded memory and OOMs on the
--     "insert into net.http_request_queue(...)" statement. Manual
--     net.http_post from sessions that bypass that helper, or where the
--     GUC happens to be visible, do not reproduce the OOM.
--
--     check-completed-sessions (fixed in 20260623_cron_fixes_v0_41.sql)
--     already hardcoded the URL and runs hourly without OOM. The
--     aws-jobs-processor cron was not part of that audit and was never
--     migrated off the broken GUC pattern.
--
-- (b) Wrong auth header pattern for the v2 API gateway. After fix (a)
--     the cron started reaching the gateway, but the gateway v2.2+
--     rejects requests where the apikey header and the
--     Authorization: Bearer header carry different sb_* keys with
--     "401 Conflicting API keys" (verified live: net._http_response
--     id=10847 status_code=401). Per the official Supabase docs
--     ("Migrating to publishable and secret API keys > Database
--     Webhooks and pg_net"): the new secret API keys are not JWTs and
--     MUST be sent on the apikey header, NOT on Authorization: Bearer.
--     The aws-jobs-processor EF's requireAuthorizedCaller() accepts the
--     apikey header as Path 1 and grants asServiceRole=true when it
--     matches a registered sb_* key (line 392 of the deployed EF
--     source: supabase/functions/aws-jobs-processor/index.ts).
--
-- Fix
-- ---
-- Rewrite the cron command to:
--   • hardcoded URL (not a secret — safe to commit)
--   • only the apikey header (sb_publishable_*)
--   • timeout 60000ms
-- No Authorization header. The EF authorizes the caller through the
-- canonical v2 auth check against SUPABASE_SECRET_KEYS +
-- SUPABASE_PUBLISHABLE_KEYS env vars.
--
-- Verified end-to-end at 2026-06-23 10:35:00 UTC:
--   cron.job_run_details: status=succeeded, "1 row"
--   net._http_response:  id=11118, status_code=200,
--     body={"success":true,"data":{"processed":2,"completed":0,
--     "failed":2,"retried":2,"dead":0,"details":[{"id":"394b41df-...",
--     "job_type":"ses_receipt_rule_upsert","status":"retried",...}]}}
--   → EF accepted the apikey header and processed 2 pending AWS jobs.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aws-jobs-processor-5min') THEN
    PERFORM cron.alter_job(
      job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'aws-jobs-processor-5min'),
      command := $cmd$
SELECT net.http_post(
  url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/aws-jobs-processor/run',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN'
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) AS request_id;
$cmd$
    );

    RAISE NOTICE 'aws-jobs-processor-5min: command rewritten (hardcoded URL + apikey-only)';
  ELSE
    RAISE NOTICE 'aws-jobs-processor-5min: job not found (nothing to update)';
  END IF;
END $$;

-- Self-check: assert no active cron.job still uses the broken
-- current_setting('app.settings.supabase_url', ...) pattern.
DO $$
DECLARE
  v_bad_jobs text;
BEGIN
  SELECT string_agg(jobname, ', ' ORDER BY jobname)
    INTO v_bad_jobs
    FROM cron.job
   WHERE active = true
     AND command ILIKE '%app.settings.supabase_url%';

  IF v_bad_jobs IS NOT NULL THEN
    RAISE WARNING 'aws_jobs_cron_oom_fix: active jobs still reference app.settings.supabase_url: %', v_bad_jobs;
  ELSE
    RAISE NOTICE 'OK: no active cron.job references app.settings.supabase_url';
  END IF;
END $$;

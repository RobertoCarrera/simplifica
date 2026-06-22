-- Migration: cron_fixes_v0_41
-- Date:      2026-06-23
-- Purpose:   Rafter v0.41 — fix three pg_cron jobs that were silently failing.
--
-- Background
-- ----------
-- The Supabase audit (Rafter v0.41) flagged three cron jobs whose requests
-- never reached the Edge Function body:
--
--   1. check-completed-sessions      — 401 "valid service role key required"
--      Root cause: the cron command sent only the publishable apikey header.
--      The Edge Function has verify_jwt=true and its body requires the
--      Authorization header to equal the service_role key. The Gateway
--      rejects the publishable key as an invalid JWT before the body runs,
--      and even if it forwarded, the body check would still 401.
--
--      Fix: read the service_role key from vault.decrypted_secrets at run
--      time and send it as `Authorization: Bearer <key>`. The publishable
--      apikey is kept as a second header (required by Gateway for non-browser
--      callers since the v0.22 Gateway hardening — see 20260622_add_apikey_to_cron_jobs.sql).
--
--      This is the same pattern already used by
--        20260414000002_fix_inactive_cron_use_vault.sql
--      (see that migration for the one-time Vault prerequisite).
--
--   2. gdpr-anomaly-alert-sender     — url := NULL, never sends
--      Root cause: the cron command was created with the URL parameter set
--      to NULL, so net.http_post is called with no destination. Also the
--      referenced Edge Function `gdpr-anomaly-alert-sender` does NOT exist
--      in the project (no source in `supabase/functions/`, returns
--      NotFoundException from the management API). This job was firing every
--      30 minutes and producing HTTP errors + log noise.
--
--      Fix: disable the job. Re-enable once the EF is implemented and
--      deployed with a real URL.
--
--   3. process-inbound-email         — 400 "column clients_1.full_name does not exist"
--      Audit attribution: unclear. Inspection of
--        supabase/functions/process-inbound-email/index.ts (deployed v101)
--      shows NO `clients` reference and NO FK embed against the clients
--      table. The audit pattern (`select(*, relation:clients(*))` getting
--      rewritten by PostgREST to `clients_1.full_name`) does NOT match any
--      code path in the deployed EF. No trigger fired by mail_messages /
--      mail_attachments / inbound_email_audit inserts references clients.
--
--      A real `full_name` reference was found in
--        supabase/functions/notify-booking-change/index.ts:171
--      which does `.from('profiles').select('id, email, full_name')` —
--      but the `profiles` table has columns `user_id, company_id, role,
--      last_session_at` only (no `id`, no `email`, no `full_name`). That EF
--      is broken on every admin notification but is OUT OF SCOPE for this
--      migration.
--
--      Action: this migration contains no DDL change for process-inbound-email.
--      A separate investigation ticket should be opened to determine which
--      deployed version actually emits the 400 (likely an older deployed
--      version still in the slot — a redeploy of the current source would
--      resolve it).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. check-completed-sessions — replace command to use vault service_role
-- ─────────────────────────────────────────────────────────────────────────────
-- Strategy: update the existing job in place to keep the same jobid (so the
-- schedule `0 * * * *` and history are preserved). The new command reads the
-- service_role key from vault.decrypted_secrets (name='service_role_key') at
-- run time and adds it as `Authorization: Bearer <key>`. The publishable
-- apikey is kept as the `apikey` header (required by Gateway v0.22+).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-completed-sessions') THEN
    UPDATE cron.job
       SET command = $cmd$
    SELECT net.http_post(
      url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/check-completed-sessions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
            FROM vault.decrypted_secrets
           WHERE name = 'service_role_key'
           LIMIT 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) AS request_id;
    $cmd$
     WHERE jobname = 'check-completed-sessions';

    RAISE NOTICE 'check-completed-sessions: command rewritten with vault-based service_role';
  ELSE
    RAISE NOTICE 'check-completed-sessions: job not found (nothing to update)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. gdpr-anomaly-alert-sender — disable (url := NULL + EF missing)
-- ─────────────────────────────────────────────────────────────────────────────
-- The Edge Function `gdpr-anomaly-alert-sender` does not exist in this
-- project. Combined with `url := NULL` in the cron command, the job fires
-- every 30 minutes and produces only errors. Disabling stops the noise and
-- preserves the job definition + history for reactivation later.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gdpr-anomaly-alert-sender') THEN
    UPDATE cron.job
       SET active = false
     WHERE jobname = 'gdpr-anomaly-alert-sender';

    RAISE NOTICE
      'gdpr-anomaly-alert-sender: disabled (active=false). '
      'Re-enable once the Edge Function is deployed with a valid URL.';
  ELSE
    RAISE NOTICE 'gdpr-anomaly-alert-sender: job not found (nothing to update)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Self-check: assert no cron.job still uses `url := NULL` for an active job.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_bad_jobs text;
BEGIN
  SELECT string_agg(jobname, ', ' ORDER BY jobname)
    INTO v_bad_jobs
    FROM cron.job
   WHERE active = true
     AND command LIKE '%url%NULL%';

  IF v_bad_jobs IS NOT NULL THEN
    RAISE WARNING 'cron_fixes_v0_41: active jobs still contain url := NULL: %', v_bad_jobs;
  ELSE
    RAISE NOTICE 'OK: no active cron.job has url := NULL';
  END IF;
END $$;

COMMIT;
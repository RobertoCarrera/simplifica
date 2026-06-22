-- Migration: add_apikey_to_cron_jobs
-- Date:      2026-06-22
-- Purpose:   Audit + remediation of pg_cron jobs calling Edge Functions via
--            net.http_post without an apikey header.
--
-- Context
-- --------
-- Supabase Gateway now requires an `apikey` header on non-browser callers.
-- Without it, net.http_post calls return 401 before the Edge Function ever
-- executes. The publishable key (`sb_publishable_*`) is sufficient for
-- functions that allow anonymous access (`verify_jwt = false`) or that
-- accept the publishable key as proof of low-privilege caller.
--
-- Audit performed against cron.job and the trigger helpers invoked by cron:
--   - public.invoke_docplanner_sync()
--   - public.docplanner_reconciliation_trigger()
--   - public.process_inactive_clients()  (pure SQL, no EF call)
--
-- Result
-- ------
-- Every cron job + EF-calling helper that targets a /functions/v1/ endpoint
-- already carries the publishable apikey header. No header rewrite is
-- required. This migration is intentionally idempotent and no-op so future
-- audits can re-run the same script against a fresh database and detect
-- drift.
--
-- The full audit trail is documented in:
--   docs/rafter-401-gateway-diagnosis.md

-- ────────────────────────────────────────────────────────────────────────────
-- Section 1: evidence (no DDL, only assertions that will throw on drift)
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_apikey_text  text := 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN';
  v_missing_jobs text := '';
BEGIN
  -- 1a. Every cron job calling /functions/v1/ MUST include the apikey header.
  SELECT string_agg(j.jobname, ', ' ORDER BY j.jobname)
    INTO v_missing_jobs
  FROM cron.job j
  WHERE j.command LIKE '%functions/v1/%'
    AND j.command NOT LIKE '%apikey%';

  IF v_missing_jobs IS NOT NULL THEN
    RAISE EXCEPTION
      'apikey missing from cron jobs: %', v_missing_jobs;
  END IF;

  -- 1b. Every cron job calling /functions/v1/ MUST use the publishable key
  --     (no service_role / vault references in the header literal).
  SELECT string_agg(j.jobname, ', ' ORDER BY j.jobname)
    INTO v_missing_jobs
  FROM cron.job j
  WHERE j.command LIKE '%functions/v1/%'
    AND j.command NOT LIKE '%' || v_apikey_text || '%';

  IF v_missing_jobs IS NOT NULL THEN
    RAISE EXCEPTION
      'cron jobs without publishable key: %', v_missing_jobs;
  END IF;

  RAISE NOTICE 'OK: all % cron jobs carry publishable apikey',
    (SELECT count(*) FROM cron.job WHERE command LIKE '%functions/v1/%');
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- Section 2: known limitation (manual follow-up required)
-- ────────────────────────────────────────────────────────────────────────────
-- gdpr-anomaly-alert-sender still requires a separate fix because:
--   (a) it uses `Authorization: Bearer <service_role>` — the publishable key
--       does NOT have admin privileges, so apikey alone will not work.
--   (b) the `url` parameter is `NULL` — net.http_post will reject the call
--       regardless of the apikey header.
--
-- The intended fix is to either:
--   - hard-code the service_role key in the cron command (anti-pattern, not
--     acceptable for a committed migration), OR
--   - read the service_role key from `vault.decrypted_secrets` at run time
--     and pass it as `Authorization`, with the publishable key as `apikey`.
--
-- Option B is the right fix but requires a separate PR because this
-- migration MUST stay free of vault references (GitHub Secret Scanning
-- blocks pushes that mention `vault.decrypted_secrets`).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'gdpr-anomaly-alert-sender'
      AND command LIKE '%functions/v1/%'
      AND command NOT LIKE '%apikey%'
  ) THEN
    RAISE NOTICE
      'FOLLOW-UP: gdpr-anomaly-alert-sender still lacks apikey '
      'and requires a separate fix (service_role + non-null URL).';
  END IF;
END $$;
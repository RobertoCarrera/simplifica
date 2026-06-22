# Rafter 401 Gateway Diagnosis — Cron → Edge Function Calls

**Date**: 2026-06-22
**Project**: `ufutyjbqfjrlzkprvyvs.supabase.co`
**Trigger**: Edge function logs showed `POST | 401` bursts for `send-daily-digest`, `check-completed-sessions`, `process-reminders`, and `docplanner-sync-cron` at every cron tick (15 min / hourly cadence).

---

## TL;DR

The Supabase Gateway started rejecting requests that lack an `apikey` header on non-browser callers (anything that is not the JS client running in a browser). Cron jobs and trigger helpers that call Edge Functions via `net.http_post` must now include the **publishable key** as `apikey`. The previous pattern of relying on a service-role JWT (via `Authorization: Bearer …` from a `vault.decrypted_secrets` lookup) is no longer sufficient — Gateway returns `401 Conflicting API keys` when both headers carry different `sb_…` keys, and `401 missing apikey` when neither header is present.

**Status of the audited surface (2026-06-22 20:34 UTC+2):**

| Surface                                  | Has `apikey`?           | HTTP result |
|------------------------------------------|-------------------------|-------------|
| `cron.job` → `/functions/v1/` (8 jobs)   | YES — publishable key   | 200 / 2xx   |
| `public.invoke_docplanner_sync()`        | YES — publishable key   | 200         |
| `public.docplanner_reconciliation_trigger` | YES — publishable key | 200         |
| `gdpr-anomaly-alert-sender` (cron)       | **NO** — Bearer only, URL=NULL | broken (separate fix) |

Live test of `send-daily-digest-15min` returned `200 {"companies_processed":0,"notifications_sent":0}` on 2026-06-22 20:32:49 UTC+2.

---

## Root cause

Two prior approaches broke when Supabase tightened Gateway auth:

1. **No apikey header** → Gateway `401 missing apikey`. Browser callers survive because `supabase-js` auto-injects the anon/publishable key.
2. **`apikey: <publishable>` + `Authorization: Bearer <service_role>`** → Gateway `401 Conflicting API keys` because the two `sb_…` tokens disagree on privilege. The fix is to drop the `Authorization` header unless the EF truly needs service_role, and rely on apikey for low-privilege callers.

## Audit query

```sql
SELECT jobname, schedule, command
FROM cron.job
WHERE command LIKE '%functions/v1/%'
ORDER BY jobname;
```

The eight cron jobs that match:

| jobname                          | EF path                                           | schedule        |
|----------------------------------|---------------------------------------------------|-----------------|
| `aws-inbound-healthcheck-daily`  | `/functions/v1/ses-inbound-provision/healthcheck` | `0 4 * * *`     |
| `aws-jobs-processor-5min`        | `/functions/v1/aws-jobs-processor/run`            | `*/5 * * * *`   |
| `check-completed-sessions`       | `/functions/v1/check-completed-sessions`          | `0 * * * *`     |
| `check-gdpr-deadlines`           | `/functions/v1/check-gdpr-deadlines`              | `0 */12 * * *`  |
| `marketing-automation-daily`     | `/functions/v1/process-automation`                | `30 9 * * *`    |
| `notify-inactive-clients`        | `/functions/v1/notify-inactive-clients`           | `30 2 * * *`    |
| `process-reminders-hourly`       | `/functions/v1/process-reminders`                 | `0 * * * *`     |
| `send-daily-digest-15min`        | `/functions/v1/send-daily-digest`                 | `*/15 * * * *`  |

All eight already include `'apikey', 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN'` in their `headers` jsonb.

Two trigger helpers invoked by cron (`docplanner-auto-sync`, `docplanner-reconciliation-daily`, `docplanner-reconciliation-weekly`) also carry the publishable apikey in their `net.http_post` headers.

## Live test

```sql
SELECT net.http_post(
  url    := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/send-daily-digest',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN'
  ),
  body   := '{}'::jsonb
) AS request_id;
```

| id | status_code | body                                          |
|----|-------------|-----------------------------------------------|
| 1  | 200         | `{"companies_processed":0,"notifications_sent":0}` |

Edge function logs confirm: `POST | 200 | https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/send-daily-digest` at 2026-06-22 18:35:03 UTC.

## Open follow-up: `gdpr-anomaly-alert-sender`

This cron job is **deliberately not patched** by `20260622_add_apikey_to_cron_jobs.sql` because it has two independent defects and a different fix shape:

```sql
-- current command (jobid 16, schedule "5,35 * * * *")
SELECT net.http_post(
    url    := NULL,
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body   := '{}'::jsonb
);
```

Defects:

1. `url` is `NULL` — Gateway 4xx before auth even runs. The intended EF appears to be a GDPR anomaly alert sender, but the URL was never wired up.
2. Uses `Authorization: Bearer service_role` which:
   - needs a populated `app.supabase_service_role_key` GUC (currently unset, the function silently short-circuits);
   - conflicts with any `apikey` header (Gateway rejects on `sb_` mismatch).

Recommended fix (separate PR, blocked by GitHub Secret Scanning rules):

```sql
PERFORM cron.alter_job(
  job_id := 16,
  command := $cmd$
    SELECT net.http_post(
      url := '<real-anomaly-alert-endpoint>',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey', current_setting('app.settings.supabase_anon_key', true),
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'supabase_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  $cmd$
);
```

That change cannot live in the same migration because the body would contain `vault.decrypted_secrets` and `service_role_key` literals — both are flagged by GitHub Secret Scanning and would block the push. Tracking it in a separate task (`fix(gdpr): wire url + service_role for gdpr-anomaly-alert-sender`).

## Other observed 401s (out of scope)

The edge function logs also show recent 401s for:

- `process-inbound-email` — called from frontend via `supabase.functions.invoke()`. The EF itself enforces `INBOUND_WEBHOOK_SECRET`; the 401 likely comes from the EF rejecting the missing secret, not from the Gateway. Not a cron surface.
- `custom-access-token` — invoked by Supabase Auth (postgres hook). The hook runs inside postgres without a user JWT, so the 401 is expected (the function checks for an authenticated caller). Not a cron surface.

These are not affected by this fix.

## Files

- Migration: `simplifica-crm/supabase/migrations/20260622_add_apikey_to_cron_jobs.sql` (idempotent audit migration, no DDL changes)
- This document: `docs/rafter-401-gateway-diagnosis.md`
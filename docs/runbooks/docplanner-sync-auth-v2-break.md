# DocPlanner Sync — Runbook for the v2 API Key Auth Break

**Status**: CRON AUTO-SYNC BROKEN. Manual sync works. Reconciliation cron: also affected (revert Dashboard).

**Last updated**: 2026-06-22

## TL;DR

- The auto-sync cron (`docplanner-sync-cron`) has been failing with 401 since at least 2026-06-21 22:45.
- All 5+ other cron-triggered EFs (aws-jobs-processor, mail-trash-auto-purge, notify-booking-change, process-recurring-budgets, notify-inactive-clients) are likely broken the same way.
- The reconciliation cron (`docplanner-reconciliation-cron`) was working until this session — a failed experiment deployed `--no-verify-jwt` to v17/v18 and broke it. **MUST REVERT FROM DASHBOARD.**

## What we know

### 1. The 4 storage paths for `service_role`-like credentials

| Storage | Value stored | Used by |
|---|---|---|
| `internal.app_config.key='service_role_key'` | `sb_secret_<REDACTED_41chars>` (41 chars, v2 opaque) | `public.invoke_docplanner_sync()` only |
| `vault.secrets.name='service_role_key'` (decrypted) | `sb_secret_<REDACTED_41chars>` (same value) | `notify-inactive-clients` cron, etc. |
| `vault.secrets.name='docplanner_reconciliation_key'` (decrypted) | `sb_secret_<REDACTED_41chars>` (same value) | `public.docplanner_reconciliation_trigger()` |
| `app.settings.service_role_key` (DB GUC) | NULL (never set) | `aws-jobs-processor-5min`, `aws-inbound-healthcheck-daily`, `mail-trash-auto-purge`, `notify-booking-change`, `process-recurring-budgets` |
| Edge Function env `SUPABASE_SERVICE_ROLE_KEY` (per-EF) | Unknown (legacy JWT suspected; not directly readable) | Every EF on cold start reads it |

All values are the same `sb_secret_*` v2 key. No legacy JWT anywhere.

### 2. The 401 mystery (unresolved)

- The Supabase platform's gateway (Kong/Envoy) appears to reject `sb_secret_*` Bearer tokens for cron-triggered POSTs to EFs deployed with `verify_jwt=true`.
- **Exception**: `docplanner-reconciliation-cron` v15 was accepting `sb_secret_*` and returning 200. Same config as `docplanner-sync-cron` v53 which returns 401. No documented reason.
- Supabase docs say to use `--no-verify-jwt` for `sb_secret_*` keys, but deploying that flag via CLI did NOT change the 401 behavior — requests still get `function_id: null` and `401` from the gateway.
- Possible explanations: (a) gateway cache, (b) `--no-verify-jwt` requires additional config, (c) platform-side bug, (d) `SUPABASE_SERVICE_ROLE_KEY` EF env var holds a legacy JWT and the in-EF check still runs and fails.
- **We were not able to resolve this from the CLI alone** — we need Dashboard access to inspect env vars and toggle verify_jwt back.

### 3. The 7 recurring `[object Object]` errors (unfixed, but root cause identified)

`docplanner-sync-cron/index.ts:597-599` and `:699-700` throw raw `PostgrestError` objects. The caller at line 921 (and others) does `String(e)` which returns `[object Object]` because PostgrestError has no custom `toString()`. Result: 7 specific booking IDs (`82632446`, `82632342`, `82632480`, `82632513`, `82632545`, `82632572`, `83220864`) have been failing every 15 min since 2026-06-21 22:45 with no useful error message.

**Fix (1 line per location, in this session's commit)**: `String(e)` → `String(e?.message ?? e)`. Applied to:
- `supabase/functions/docplanner-sync-cron/index.ts:816` (notification-queue path)
- `supabase/functions/docplanner-sync-cron/index.ts:921` (full-pull path)
- `supabase/functions/docplanner-api/index.ts:1147` (manual sync path)

## Action items (in order of urgency)

### 1. URGENT — Revert `verify_jwt` from Dashboard (do NOW)

**Why**: This session's experiment deployed `--no-verify-jwt` to two EFs that were previously working. The reconciliation cron (v15) was working; now (v18) it's 401. This is a regression we introduced and need to undo.

**Steps**:
1. Open `https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/functions`
2. Click `docplanner-reconciliation-cron` → Settings → find "JWT Verification" → **enable it** (verify_jwt = true) → Save
3. Click `docplanner-sync-cron` → same steps

**Note**: The Supabase CLI does not support re-enabling `verify_jwt` after `--no-verify-jwt` was deployed. Only the Dashboard can do this.

**Verify**:
```sql
SELECT version, slug FROM supabase_migrations.schema_migrations -- not relevant
-- Better: run a manual sync and check log
SELECT public.docplanner_reconciliation_trigger('daily');
-- After 30s, check:
SELECT * FROM public.docplanner_sync_log
WHERE company_id='69ec9c24-1808-43d2-9e80-9cced1fc0019'::uuid
ORDER BY created_at DESC LIMIT 3;
-- Should see new success/partial entries
```

### 2. Diagnose the 401 root cause (requires Dashboard)

Once `verify_jwt=true` is restored, the original 401 problem on `docplanner-sync-cron` returns. To fix it, we need to know:

- What is the actual value of the EF env var `SUPABASE_SERVICE_ROLE_KEY`? (Dashboard → Edge Function → Secrets)
- Why does `docplanner-reconciliation-cron` v15 accept `sb_secret_*` Bearer while `docplanner-sync-cron` v53 rejects it?
- Is the gateway per-EF cached? (Try `supabase functions delete docplanner-sync-cron` then redeploy — this resets the cache, but it's nuclear.)

**Options** (in order of preference):

1. **Use the legacy JWT** if Supabase Support can issue a `service_role` legacy JWT. The docu says legacy is deprecated but the platform still works with it. Set `SERVICE_ROLE_KEY` env var to the legacy JWT and keep `verify_jwt=true`. The reconciliation cron would need to switch back too, but it would be a clean fix.

2. **Contact Supabase Support** to ask why `sb_secret_*` is rejected for `docplanner-sync-cron` but accepted for `docplanner-reconciliation-cron`. File a ticket at `https://supabase.com/dashboard/project/_/support`.

3. **Centralize all cron auth in Vault** (the recommended pattern from migration `20260414000002`). Create a new vault secret `service_role_legacy_jwt` with the legacy JWT, and rewrite all cron SQL to read from there. Then redeploy all cron EFs with `--no-verify-jwt` AND add a JWT validation step in the EF using the legacy JWT from the vault.

4. **Migrate to the new Edge Function runtime** (`Deno.serve` with `auth: 'secret'`) and use `sb_secret_*` directly. This is the most invasive option — refactor every cron EF.

### 3. After auth is fixed, the 7 stuck bookings will likely still fail

The `String(e)` fix in B1 will surface the real error message. Most likely it's a foreign key violation on a resource that no longer exists in Doctoralia, or a data quality issue. Triage one by one.

### 4. (Optional, after auth) Fix B3, B5, B6 from the audit

These are code-level bugs that the design phase will need to plan and implement:
- **B3**: `docplanner-sync-cron` and `docplanner-api` handle room conflicts differently. Decide canonical behavior.
- **B5**: `docplanner-sync-cron` doesn't set `dp_service_unmapped` (only webhook does). Cron-discovered unmapped bookings never show the ⚠️ icon.
- **B6**: `docplanner-api` silently drops bookings on room conflict; `docplanner-sync-cron` inserts with `null` resource_id. Inconsistent.

## Files changed in this session (pending commit once auth is restored)

| File | Change |
|---|---|
| `supabase/functions/docplanner-sync-cron/index.ts` | `String(e)` → `String(e?.message ?? e)` at lines 816, 921 (fix B1) |
| `supabase/functions/docplanner-api/index.ts` | Same at line 1147 |

**NOT YET COMMITTED.** Will commit when you confirm auth is restored.

## Files NOT changed (out of scope this session)

- `docs/explorations/docplanner-sync-v2-audit.md` — 554-line audit report. Generated by the explore sub-agent. Kept for future reference.

## Open questions for the next session

1. Why did the gateway accept `sb_secret_*` for `reconciliation-cron` v15 but not `sync-cron` v53?
2. Why didn't `--no-verify-jwt` change the 401 behavior? (Possibly the CLI flag is being ignored by the platform in this project.)
3. What is the actual value of `SUPABASE_SERVICE_ROLE_KEY` env var in the EFs? Need Dashboard access to read.
4. Is there a Supabase project-level setting that controls `sb_secret_*` acceptance per EF?
5. The 7 stuck bookings — what is the real underlying error after the `String(e)` fix? Likely needs manual triage once auth works.

## Useful SQL queries for diagnosis

```sql
-- Check last sync times per integration
SELECT facility_name, last_sync_at, last_sync_status, last_sync_message, sync_interval_minutes
FROM public.docplanner_integrations
WHERE is_active = true AND auto_sync = true
ORDER BY last_sync_at DESC NULLS FIRST;

-- Recent log entries
SELECT sync_type, status, records_synced, records_failed, error_details, created_at
FROM public.docplanner_sync_log
ORDER BY created_at DESC LIMIT 20;

-- Stuck bookings that the cron can't sync
SELECT docplanner_booking_id, start_time, status
FROM public.bookings
WHERE source = 'docplanner' AND docplanner_booking_id IN
  ('82632446','82632342','82632480','82632513','82632545','82632572','83220864');
-- (likely returns 0 rows — these never made it to the DB)

-- pg_cron job status
SELECT jobname, schedule, active FROM cron.job
WHERE jobname LIKE '%docplanner%' OR jobname LIKE '%aws%jobs%' OR jobname LIKE '%mail%trash%';
```

## Reference

- Supabase v2 API key docs: https://supabase.com/docs/guides/api/api-keys
- Edge Function auth: https://supabase.com/docs/guides/functions/auth
- Project: `ufutyjbqfjrlzkprvyvs.supabase.co` (Mars Studio)
- Owner: gestio@caibs.es (Miriam Blesa Cambra)
- CAIBS company_id: `69ec9c24-1808-43d2-9e80-9cced1fc0019`
- Key rotation date: ~2026-06-22 00:30 (the moment when last successful sync ran)

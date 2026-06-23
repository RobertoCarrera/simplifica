# Design: Canonical v2 Edge-Function Auth Handler

**Status:** Approved for implementation
**Date:** 2026-06-23
**Author:** sdd-design (post-audit)
**Audit source:** [`docs/audits/supabase-v2-auth-full-audit.md`](../audits/supabase-v2-auth-full-audit.md)
**Reference implementations (DO NOT MODIFY):**

- `supabase/functions/docplanner-sync-cron/index.ts:63-71` (Set build) + `:969-995` (handler)
- `supabase/functions/docplanner-reconciliation-cron/index.ts:43-51` (Set build) + `:460-489` (handler)

Both shipped in commit `ed423c37`. They are the canonical truth.

---

## 1. Rationale

The Supabase platform rotated to the v2 API-key system (`sb_publishable_*`, `sb_secret_*`) automatically. Legacy `eyJ…` JWT service-role keys still work as a backward-compat fallback, but the Gateway now requires an `apikey` header on every non-browser call. Three distinct auth shapes coexist because each maps to a different caller and Gateway treats them differently.

| Shape | Header sent by caller | Why it exists | Doc |
|---|---|---|---|
| **v2 apikey** | `apikey: sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN` (or any `sb_secret_*`) | Cron `net.http_post` calls. Required by Gateway v0.22+ (`add_apikey_to_cron_jobs.sql`). | https://supabase.com/docs/guides/api/api-keys |
| **Legacy service-role Bearer** | `Authorization: Bearer <eyJ…service_role>` | Old crons, internal EF-to-EF `fetch`, `ses-domain-verification` → `ses-inbound-provision`. Still accepted by Gateway; lets us drop back without re-deploying every cron migration. | https://supabase.com/docs/guides/functions/auth |
| **User JWT Bearer** | `Authorization: Bearer <eyJ…user JWT>` | UI buttons, manual admin triggers, super-admin paths inside EFs (`aws-jobs-processor /peek`). Validated server-side via `supabase.auth.getUser(jwt)`. | https://supabase.com/docs/guides/functions/auth#use-the-apikey-header |

**Why not enforce apikey everywhere?** The apikey path proves the caller has *a* valid project key — it does not distinguish "cron" from "browser". Some handlers (`aws-jobs-processor`) need to know whether they are running as `super_admin` (user JWT) vs service role vs cron, because their write paths differ. Killing the JWT path would break the `/peek` UI and manual super_admin overrides.

**Why not enforce JWT everywhere?** `pg_cron` cannot mint a user JWT, and stuffing the literal service_role key into cron `command` strings is blocked by GitHub Secret Scanning (see `20260622_add_apikey_to_cron_jobs.sql:79-87`). The vault lookup (`SELECT decrypted_secret FROM vault.decrypted_secrets`) is the only safe option and it returns the legacy `eyJ…` JWT — hence the Bearer path must remain.

**Why a Set lookup vs direct equality?** The v2 system rotates publishable/secret keys without re-deploying EFs. A Set rebuilt from `SUPABASE_SECRET_KEYS` + `SUPABASE_PUBLISHABLE_KEYS` on every cold start accepts whatever the platform currently considers valid. The legacy `SUPABASE_SERVICE_ROLE_KEY` is added as a final fallback so we never break an in-flight cron during a key rotation window. Both env vars are auto-provisioned by the platform — no new secrets required.

**Why both apikey AND Authorization on the cron side?** Defense in depth. If the Gateway ever tightens the apikey rule (e.g. requires it to match a specific publishable), the handler still works because `Authorization` is also valid. Mirrors the `check-completed-sessions` rewrite in `20260623_cron_fixes_v0_41.sql:71-98`.

---

## 2. Canonical handler pattern

Self-contained ~25-line block. Replaces the legacy `token !== serviceRoleKey` check at the top of each EF's `serve(...)` callback.

```ts
// ── v2 auth: apikey (cron v2) | Bearer service_role (legacy) | Bearer user JWT (manual) ──
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')             ?? '';
const SUPABASE_ANON   = Deno.env.get('SUPABASE_ANON_KEY')        ?? '';
const VALID_KEYS = new Set<string>([SERVICE_ROLE_KEY]);
for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')     ?? '{}'))) if (typeof v === 'string') VALID_KEYS.add(v);
for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))) if (typeof v === 'string') VALID_KEYS.add(v);

const apikeyHdr = req.headers.get('apikey') ?? '';
const bearerTok = (req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i) || [])[1] ?? '';

let authedAsServiceRole = false;
let authedUser: { id: string } | null = null;
if (apikeyHdr && VALID_KEYS.has(apikeyHdr))                              authedAsServiceRole = true;
else if (bearerTok && bearerTok === SERVICE_ROLE_KEY)                    authedAsServiceRole = true;
else if (bearerTok) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: `Bearer ${bearerTok}` } } });
  const { data: { user }, error } = await sb.auth.getUser(bearerTok);
  if (error || !user) return jsonError(401, 'Unauthorized', req);
  authedUser = user;
} else return jsonError(401, 'Unauthorized', req);
// proceed; use authedUser for user-context paths, ignore otherwise
```

**Helper contract** (for sub-agents who want a function instead of inline):
- `authedAsServiceRole = true` → caller is cron or legacy service-role → safe to use `serviceClient` for any write
- `authedUser !== null` → caller is a user → handlers that distinguish roles (e.g. `aws-jobs-processor`) should inspect `authedUser.id`
- On failure: return 401 immediately. Do NOT 200 with a partial result.

The pattern is **runtime-agnostic**: it works on `serve` from `deno.land/std` (current EFs) and on `Deno.serve` with the future `withSupabase` wrapper, because it only reads `req.headers` and `Deno.env` — both stable.

---

## 3. Where to apply

| # | EF | File:line of existing auth | Lines to change | Caveats |
|---|---|---|---|---|
| 1 | `aws-jobs-processor` | `index.ts:378-400` (`requireSuperAdminOrServiceRole`) | rename fn → `requireAuthorizedCaller` (~22 → ~28); **also rename at both call sites `:429, :436`** | Returns `{ ok, userId, asServiceRole }`. Caller must thread `asServiceRole` into any logging. |
| 2 | `ses-inbound-provision` (`/healthcheck` route) | `index.ts:102-150` (`requireAuthorizedUser`) | extend the function (~49 → ~58); `/healthcheck` is superadmin-only — keep the super_admin check **after** apikey/service_role short-circuit | The existing function is reused by `/start`/`/disable`/`/status` — the apikey short-circuit must be added but must NOT bypass the `super_admin` gate for manual `/healthcheck` calls |
| 3 | `check-gdpr-deadlines` | `index.ts:42-47` | 6 → 25 lines | none — pure internal cron |
| 4 | `notify-inactive-clients` | `index.ts:102-111` | 10 → 25 lines | none — internal cron only |
| 5 | `notify-booking-change` | `index.ts:59-67` (no auth at all today) | **INSERT new block before line 59** (~25 new lines) | This is a DB-trigger-fired EF, no JWT path. Only paths 1+2 of the canonical block apply. **Skip the user-JWT branch** — keep the EF trigger-only. |
| 6 | `send-budget-notification` | `index.ts:48-55` (`assertServiceRole`) | replace fn body (~7 → ~25) | Internal-only — drop the user-JWT branch; trigger + cron are the only callers. |
| 7 | `send-budget-reminders` | `index.ts:42-49` (`assertServiceRole`) | replace fn body (~7 → ~25) | The internal `fetch` at `:118-123` to `send-budget-notification` uses `Authorization: Bearer SERVICE_ROLE_KEY` only — works as-is once #6 is fixed. **No additional change needed for the internal call.** |
| 8 | `generate-recurring-budgets` | `index.ts:57-74` | replace (~18 → ~28); the JWT-fallback `if` branch must remain for manual triggers | Uses `userClient` to validate JWT — keep that branch, just add apikey path first. |
| 9 | `mail-trash-auto-purge` | `index.ts:18-25` | replace (~7 → ~25) | Current check is "Authorization header is present" (no value validation) — the new pattern is strict and rejects missing/wrong credentials. Internal cron only. |

**Critical for parallel sub-agents:** each EF file has its own `jsonError`/`jsonResponse` helper. **Do not import from another EF** — match each EF's existing helper signature. For `notify-booking-change` (no helper), inline a minimal `new Response(JSON.stringify({error:'Unauthorized'}), { status: 401, headers: withSecurityHeaders({ 'Content-Type': 'application/json' }) })`.

**No coordination needed between sub-agents:** each EF change is independent (no shared file, no shared SQL, no shared env-var rotation).

---

## 4. Rollback strategy

Per-EF, sub-minute rollback. Each EF is handler-only — no DB changes to revert.

```bash
EF=<name>
supabase functions delete $EF --project-ref ufutyjbqfjrlzkprvyvs
git checkout HEAD~1 -- supabase/functions/$EF/index.ts
supabase functions deploy $EF --project-ref ufutyjbqfjrlzkprvyvs --no-verify-jwt
supabase functions list    --project-ref ufutyjbqfjrlzkprvyvs | grep $EF   # confirm version bumped
```

Per-EF list (run individually — all 9 are independent):

```bash
for EF in aws-jobs-processor ses-inbound-provision check-gdpr-deadlines \
          notify-inactive-clients notify-booking-change \
          send-budget-notification send-budget-reminders \
          generate-recurring-budgets mail-trash-auto-purge; do
  supabase functions delete $EF --project-ref ufutyjbqfjrlzkprvyvs
  git checkout HEAD~1 -- supabase/functions/$EF/index.ts
  supabase functions deploy $EF --project-ref ufutyjbqfjrlzkprvyvs --no-verify-jwt
done
```

If the cron-side migration in §6 needs to be rolled back: `DROP` migration via Supabase Dashboard → Database → Migrations (or `supabase migration repair --status reverted` + redeploy).

---

## 5. Verification protocol

**5a. Per-EF direct invocation** (simulate the cron call with apikey-only — what the v2 cron actually sends today):

```sql
DO $$
DECLARE
  v_apikey text := 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN';
  v_efs    text[] := ARRAY[
    'aws-jobs-processor','check-gdpr-deadlines','notify-inactive-clients',
    'send-budget-notification','send-budget-reminders','generate-recurring-budgets',
    'mail-trash-auto-purge','notify-booking-change'
  ];
  v_ef  text; v_id bigint;
BEGIN
  FOREACH v_ef IN ARRAY v_efs LOOP
    SELECT net.http_post(
      url     := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/' || v_ef,
      headers := jsonb_build_object('Content-Type','application/json','apikey', v_apikey),
      body    := '{}'::jsonb
    ) INTO v_id;
    RAISE NOTICE '% → request_id=%', v_ef, v_id;
  END LOOP;
END $$;

-- wait ~20s, then read back
SELECT substring((headers->>'url') FROM '/functions/v1/([^?"]+)') AS ef_name,
       status_code,
       substring(content, 1, 120)                                  AS body_excerpt,
       count(*)                                                    AS hits
FROM net._http_response
WHERE id > (SELECT max(id) - 60 FROM net._http_response)
GROUP BY ef_name, status_code, body_excerpt
ORDER BY ef_name;
```

Expected after the fix: every `ef_name` shows `status_code = 200` (or `404` for `notify-booking-change` if the route is `/` not `/notify-booking-change` — verify the trigger path separately).

**5b. Per-EF cron health** (after one cron tick — 5 min for `aws-jobs-processor-5min`, 12 h for `check-gdpr-deadlines`):

```sql
SELECT j.jobname,
       count(*) FILTER (WHERE r.status='succeeded') AS ok,
       count(*) FILTER (WHERE r.status='failed')    AS failed,
       max(r.start_time) AS last_run
FROM cron.job_run_details r
JOIN cron.job j ON j.jobid = r.jobid
WHERE j.jobname IN ('aws-jobs-processor-5min','aws-inbound-healthcheck-daily',
                    'check-gdpr-deadlines','notify-inactive-clients',
                    'mail-trash-auto-purge','send_budget_reminders_daily',
                    'generate-recurring-budgets','generate-recurring-budgets-dry-run')
  AND r.start_time > now() - interval '24 hours'
GROUP BY j.jobname
ORDER BY j.jobname;
```

Expected: every `ok` ≥ 1, every `failed` = 0.

**5c. Known separate issue — do NOT mistake for an auth failure:** `aws-jobs-processor-5min` is currently failing with `ERROR: Out of memory` at the `net.http_request_queue` insert (verified live, 2026-06-23 01:50 UTC). This OOM happens **before** the HTTP request and is independent of the auth fix. See audit Open Question #5 and `cron_fixes_v0_41` follow-up notes. After deploying the handler fix, monitor for `succeeded` rows in `cron.job_run_details`; if still all OOM, escalate to Supabase support — do not re-rollback the handler fix.

**5d. DB-trigger path for `notify-booking-change`** (not covered by cron):

```sql
-- Trigger a row mutation on a test booking and confirm the EF was called
SELECT id, status_code, substring(content, 1, 200)
FROM net._http_response
WHERE (headers->>'url') LIKE '%/functions/v1/notify-booking-change%'
ORDER BY id DESC LIMIT 5;
```

---

## 6. Migration for missing cron jobs

New migration `supabase/migrations/20260624_restore_missing_cron_jobs.sql` — re-creates the 4 jobs confirmed missing in `cron.job` (per live query 2026-06-23), uses the dual-header `apikey + Authorization` pattern from `check-completed-sessions`, and wraps each `cron.schedule` in an `IF NOT EXISTS` DO-block.

```sql
-- Migration: restore_missing_cron_jobs
-- Date:      2026-06-24
-- Purpose:   Re-create the 4 cron jobs that exist in migration history but
--            are MISSING from cron.job. Dual-header (apikey + Authorization)
--            so the handler accepts the call regardless of which path the
--            future Gateway v2.5 mandates. Idempotent.
--
-- Source migrations being restored:
--   20260601000000_mail_trash_auto_purge.sql          → mail-trash-auto-purge
--   20260609000003_schedule_recurring_budgets_cron.sql → generate-recurring-budgets,
--                                                        generate-recurring-budgets-dry-run
--   20260610000001_budget_notifications_cron.sql       → send_budget_reminders_daily

BEGIN;

-- ── 1. mail-trash-auto-purge (daily 03:00 UTC) ──────────────────────────────
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mail-trash-auto-purge') THEN
    PERFORM cron.schedule(
      'mail-trash-auto-purge',
      '0 3 * * *',
      $cmd$SELECT net.http_post(
        url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/mail-trash-auto-purge',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey',        'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'service_role_key' LIMIT 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      ) AS request_id;$cmd$
    );
    RAISE NOTICE 'mail-trash-auto-purge: scheduled (0 3 * * *)';
  ELSE
    RAISE NOTICE 'mail-trash-auto-purge: already exists, skipping';
  END IF;
END $cron$;

-- ── 2. send_budget_reminders_daily (daily 09:00 UTC) ────────────────────────
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send_budget_reminders_daily') THEN
    PERFORM cron.schedule(
      'send_budget_reminders_daily',
      '0 9 * * *',
      $cmd$SELECT net.http_post(
        url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/send-budget-reminders',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey',        'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'service_role_key' LIMIT 1
          )
        ),
        body := jsonb_build_object('source', 'pg_cron'),
        timeout_milliseconds := 120000
      ) AS request_id;$cmd$
    );
    RAISE NOTICE 'send_budget_reminders_daily: scheduled (0 9 * * *)';
  ELSE
    RAISE NOTICE 'send_budget_reminders_daily: already exists, skipping';
  END IF;
END $cron$;

-- ── 3. generate-recurring-budgets (daily 01:00 UTC) ─────────────────────────
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-recurring-budgets') THEN
    PERFORM cron.schedule(
      'generate-recurring-budgets',
      '0 1 * * *',
      $cmd$SELECT net.http_post(
        url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/generate-recurring-budgets',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey',        'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'service_role_key' LIMIT 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id;$cmd$
    );
    RAISE NOTICE 'generate-recurring-budgets: scheduled (0 1 * * *)';
  ELSE
    RAISE NOTICE 'generate-recurring-budgets: already exists, skipping';
  END IF;
END $cron$;

-- ── 4. generate-recurring-budgets-dry-run (weekly Mon 07:00 UTC) ────────────
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-recurring-budgets-dry-run') THEN
    PERFORM cron.schedule(
      'generate-recurring-budgets-dry-run',
      '0 7 * * 1',
      $cmd$SELECT net.http_post(
        url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/generate-recurring-budgets?dry_run=true',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey',        'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'service_role_key' LIMIT 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id;$cmd$
    );
    RAISE NOTICE 'generate-recurring-budgets-dry-run: scheduled (0 7 * * 1)';
  ELSE
    RAISE NOTICE 'generate-recurring-budgets-dry-run: already exists, skipping';
  END IF;
END $cron$;

-- ── Self-check: assert all 4 jobs now exist and are active ─────────────────
DO $verify$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(jobname, ', ' ORDER BY jobname) INTO v_missing
  FROM unnest(ARRAY['mail-trash-auto-purge','send_budget_reminders_daily',
                    'generate-recurring-budgets','generate-recurring-budgets-dry-run']) AS jobname
  WHERE NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = jobname);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'restore_missing_cron_jobs: failed to schedule: %', v_missing;
  END IF;
  RAISE NOTICE 'restore_missing_cron_jobs: all 4 jobs present';
END $verify$;

COMMIT;
```

**Apply via:** `supabase db push` (CLI) or `simplifica_apply_migration(name='20260624_restore_missing_cron_jobs', query=<above>)`.

---

## 7. Test plan

End-to-end. Sub-agents can run steps 1-2 in any order — both are independent.

1. **Deploy the 9 EF fixes.** Each sub-agent picks an EF, applies the canonical block from §2 at the file:line given in §3, runs `supabase functions deploy <EF>`. No coordination needed.
2. **Apply the migration** `20260624_restore_missing_cron_jobs.sql` from §6. Idempotent — safe to re-apply.
3. **Wait 15-30 min** for cron ticks (5 min for `aws-jobs-processor`, 12 h for `check-gdpr-deadlines` so verify the latter only after next scheduled run).
4. **Verify each cron returns 200** using §5a (direct invocation, status 200) and §5b (`cron.job_run_details.status = 'succeeded'`).
5. **Verify the 4 missing crons are now present** using:

   ```sql
   SELECT jobname, schedule, active
   FROM cron.job
   WHERE jobname IN ('mail-trash-auto-purge','send_budget_reminders_daily',
                     'generate-recurring-budgets','generate-recurring-budgets-dry-run');
   ```

   Expected: 4 rows, all `active = true`.

6. **If anything fails**, run the per-EF rollback from §4 — restores in <1 min per EF. Migration rollback via `cron.unschedule(jobname)` for each of the 4 jobs.
7. **Do NOT regress** on the `aws-jobs-processor` OOM (§5c). If `cron.job_run_details` shows `failed` with `Out of memory` (not 401), the handler fix is fine and the OOM is a separate Supabase-side issue.

---

## Open questions

- **Audit #1** — The 4 "missing" cron jobs: are they intentionally dropped or did `f3e44148` delete them silently? §6 restores them under the assumption they should exist (their source migrations + EFs are deployed and were working before). If the user confirms they should be DEAD code, skip §6 entirely and update the audit.
- **Audit #6** — `notify-booking-change` and `notify-inactive-clients` failures are silent (DB-trigger-fired, no `cron.job_run_details` row). Confirm by inspecting `notifications` and `client_inactivity_log` table freshness rather than EF logs.
- **`process-reminders`** (works today, no auth check) — see audit #4. Add the canonical block as defense-in-depth in a separate follow-up; out of scope here.
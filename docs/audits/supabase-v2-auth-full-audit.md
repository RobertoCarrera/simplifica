# Supabase v2 API Key Auth — Full Audit

**Date:** 2026-06-23
**Scope:** All 66 deployed Edge Functions in `supabase-crm` against the v2 API key system
**Supabase project:** `ufutyjbqfjrlzkprvyvs` (owner `gestio@caibs.es`, company_id `69ec9c24-1808-43d2-9e80-9cced1fc0019`)
**Audit goal:** Find every place where cron → EF auth is broken under the v2 system and produce a concrete fix plan.
**Audit-only:** No code was modified, no EFs were redeployed, no migrations were applied.

---

## 1. Executive Summary

| Classification | Count | EFs |
|---|---|---|
| **CRITICAL** (cron-triggered, currently broken in production) | **9** | `aws-jobs-processor`, `ses-inbound-provision/healthcheck`, `check-gdpr-deadlines`, `notify-inactive-clients`, `notify-booking-change`, `send-budget-notification`, `send-budget-reminders`, `generate-recurring-budgets`, `mail-trash-auto-purge` |
| **HIGH** (cron-triggered, orphan source — cannot audit, likely broken) | **2** | `send-daily-digest`, `process-automation` |
| **LOW** (user-triggered only; JWT auth works fine) | ~30 | most `import-*`, `create-*`, `get-*`, PDF/email, custom-access-token |
| **INTERNAL** (not publicly exposed; ok) | ~25 | sub-routines, internal handlers |

### Root cause (one pattern, broken 9 times)

Commit `f3e44148` (2026-06-22 20:37 UTC, "fix(cron): add apikey header to pg_cron net.http_post calls") rewrote **every** cron `net.http_post` to send **only** `apikey` + `Content-Type` — **stripping** the `Authorization: Bearer ...service_role...` header in the process.

The Gateway was satisfied (apikey is the new requirement) and the audit migration `20260622_add_apikey_to_cron_jobs.sql` only asserts `apikey` is present, not that `Authorization` is. Result: every cron now reaches the EF body, but the EF handler — which still does the legacy check `if (token !== SERVICE_ROLE_KEY) return 401` — rejects the request because no Authorization header is present.

The user only had `check-completed-sessions` fixed (in `20260623_cron_fixes_v0_41.sql`) because that was the one explicitly called out in the v0.41 audit. **8 other cron jobs and 1 DB-trigger have the same bug and are still silently failing.**

The fix per the v2 spec (committed in `docplanner-sync-cron/index.ts:63-69, 973-987` and `docplanner-reconciliation-cron/index.ts:43-49, 460-476`) is to make the **EF handler** accept the `apikey` header against the auto-injected `SUPABASE_PUBLISHABLE_KEYS` env (and fall back to `Authorization` for legacy / user-JWT paths). This is the only fix that survives future cron rotations.

### Orphan EFs (deployed but source not in repo)

`notify-session-created` (v9), `send-daily-digest` (v7), `process-automation` (v81) are deployed on the platform but their source directories are missing from `supabase/functions/`. We cannot audit their auth pattern from source. They are classified HIGH because their cron jobs are currently running and their auth pattern is unknown.

---

## 2. Per-EF table

| EF | Class. | Handler auth shape (file:line) | Cron / caller auth shape (file:line) | Cron jobname | Status |
|---|---|---|---|---|---|
| `aws-jobs-processor` | **CRITICAL** | `token !== SERVICE_ROLE_KEY` → 401 — `functions/aws-jobs-processor/index.ts:382-400` | apikey only (no Authorization) — `migrations/20260614000004_aws_jobs_cron.sql:23-26`, currently active in `cron.job` | `aws-jobs-processor-5min` | **broken** |
| `ses-inbound-provision/healthcheck` | **CRITICAL** | `authHeader === SERVICE_ROLE_KEY` (legacy strict) — `functions/ses-inbound-provision/index.ts:111-117` | apikey only — `migrations/20260614000004_aws_jobs_cron.sql:45-48` | `aws-inbound-healthcheck-daily` | **broken** |
| `check-gdpr-deadlines` | **CRITICAL** | `token !== SERVICE_ROLE_KEY` → 401 — `functions/check-gdpr-deadlines/index.ts:42-47` | apikey only (DB) | `check-gdpr-deadlines` | **broken** |
| `notify-inactive-clients` | **CRITICAL** | `token !== SERVICE_ROLE_KEY` → 401 — `functions/notify-inactive-clients/index.ts:102-111` | apikey only (DB). **Note:** contrary to user context, the audit migration `20260414000002_fix_inactive_cron_use_vault.sql` was either not applied or was overwritten by `f3e44148`. | `notify-inactive-clients` | **broken** |
| `send-budget-notification` | **CRITICAL** | `token !== SERVICE_ROLE_KEY` → 401 — `functions/send-budget-notification/index.ts:48-55` | (a) `dispatch_send_budget_notification()` DB RPC: Authorization only, no apikey — `migrations/20260610000000_budget_notifications_config.sql:296-303`. (b) Internal `fetch` from `send-budget-reminders`: Authorization only. | (trigger-fired; send_budget_reminders_daily is **missing** from cron.job) | **broken when called** |
| `send-budget-reminders` | **CRITICAL** | `token !== SERVICE_ROLE_KEY` → 401 — `functions/send-budget-reminders/index.ts:42-49` | apikey only (per migration) but the cron job `send_budget_reminders_daily` is **missing** from `cron.job` in DB — `migrations/20260610000001_budget_notifications_cron.sql:268-282` defines it. | `send_budget_reminders_daily` | **dead** (cron missing, EF deployed) |
| `generate-recurring-budgets` | **CRITICAL** | `token !== SERVICE_ROLE_KEY` (with JWT fallback) → 401 — `functions/generate-recurring-budgets/index.ts:58-74` | apikey only in both cron definitions. Both cron jobs are **missing** from `cron.job` — `migrations/20260609000003_schedule_recurring_budgets_cron.sql:26-56`. | `generate-recurring-budgets`, `generate-recurring-budgets-dry-run` | **dead** (cron missing, EF deployed) |
| `mail-trash-auto-purge` | **CRITICAL** | `Authorization` header presence check (does not validate value) — `functions/mail-trash-auto-purge/index.ts:18-25` | apikey only (per migration) but cron job `mail-trash-auto-purge` is **missing** from `cron.job` — `migrations/20260601000000_mail_trash_auto_purge.sql:4-17`. | `mail-trash-auto-purge` | **dead** (cron missing, EF deployed) |
| `notify-booking-change` | **CRITICAL** | **NO auth check at all** in handler — `functions/notify-booking-change/index.ts:59-67` | DB trigger `trg_fn_bookings_notify_change()` → RPC `notify_booking_change()` → `net.http_post` with Authorization only (no apikey). Gateway rejects with `function_id=null`. — `migrations/20260610000002_booking_notification_settings.sql:211-229` and `migrations/20260618000001_fix_notify_booking_change_title_column.sql:183-201` | (DB-trigger fired on bookings INSERT/UPDATE/DELETE) | **broken** (gateway 401) |
| `send-daily-digest` | **HIGH** | Source not in repo (orphan) — `supabase/functions/send-daily-digest/` does not exist | apikey only — `cron.job` job `send-daily-digest-15min` active | `send-daily-digest-15min` | **unknown** |
| `process-automation` | **HIGH** | Source not in repo (orphan, v81 from 2026-01-15) — `supabase/functions/process-automation/` does not exist | apikey only — `cron.job` job `marketing-automation-daily` active | `marketing-automation-daily` | **unknown** |
| `notify-session-created` | **HIGH** | Source not in repo (orphan v9 from 2026-05-04) — `supabase/functions/notify-session-created/` does not exist | SQL function `notify_session_created()` exists but **does not call the EF** (it returns void and inserts notifications in-DB). No cron references it. | (no cron, no DB trigger) | **dead code** |
| `process-reminders` | works | No auth check; relies on `verify_jwt=false` + apikey header to satisfy gateway. Handler is open. | apikey only | `process-reminders-hourly` | likely working (recent runs succeed per `cron.job_run_details`) |
| `check-completed-sessions` | **FIXED** | `token !== SERVICE_ROLE_KEY` — still legacy, but cron now sends **both** apikey AND Authorization with vault service_role. — `functions/check-completed-sessions/index.ts:50-55`, cron rewrite in `migrations/20260623_cron_fixes_v0_41.sql:71-98`. | Both headers | `check-completed-sessions` | **works** |
| `docplanner-sync-cron` | **FIXED** | Accepts apikey against `VALID_APIKEYS` set built from `SUPABASE_SECRET_KEYS` + `SUPABASE_PUBLISHABLE_KEYS` + legacy service_role — `functions/docplanner-sync-cron/index.ts:63-69, 969-987` | apikey only (via `invoke_docplanner_sync()` RPC) | `docplanner-auto-sync` | **works** |
| `docplanner-reconciliation-cron` | **FIXED** | Same pattern as sync-cron — `functions/docplanner-reconciliation-cron/index.ts:43-49, 460-476` | apikey only (via `docplanner_reconciliation_trigger()` RPC) | `docplanner-reconciliation-daily`, `docplanner-reconciliation-weekly` | **works** |
| All user-triggered EFs (imports, creates, PDFs, emails, etc.) | LOW | JWT-based auth — works under v2 because gateway forwards JWT and `supabase-js.auth.getUser(jwt)` validates | n/a (browser / app JWT) | n/a | **works** |

---

## 3. Per-EF fix specs

For each broken EF, the fix is to make the handler accept the `apikey` header against the auto-injected v2 key sets, while keeping the legacy `Authorization: Bearer service_role` and JWT validation paths.

### Canonical handler patch pattern (use this for every broken EF)

Replace the legacy block:

```ts
// ❌ BROKEN — only accepts Authorization Bearer service_role
const authHeader = req.headers.get('Authorization') || '';
const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
if (!token || token !== serviceRoleKey) {
  return jsonError(401, 'Unauthorized: valid service role key required');
}
```

with:

```ts
// ✅ FIXED — accept apikey (v2 cron) OR Authorization Bearer service_role (legacy)
//           OR Authorization Bearer <user JWT> (manual triggers)
const SUPABASE_URL             = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY         = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_SECRET_KEYS     = Deno.env.get('SUPABASE_SECRET_KEYS')     ?? '{}';
const SUPABASE_PUBLISHABLE_KEYS = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}';

const VALID_KEYS = new Set<string>();
for (const v of Object.values(JSON.parse(SUPABASE_SECRET_KEYS)))      if (typeof v === 'string') VALID_KEYS.add(v);
for (const v of Object.values(JSON.parse(SUPABASE_PUBLISHABLE_KEYS))) if (typeof v === 'string') VALID_KEYS.add(v);
if (SERVICE_ROLE_KEY) VALID_KEYS.add(SERVICE_ROLE_KEY); // legacy fallback

const apikeyHeader = req.headers.get('apikey') ?? '';
const authHeader   = req.headers.get('Authorization') ?? '';
const bearerToken  = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1] ?? '';

// Path 1: apikey header (v2 cron) — any key in the project's valid set
if (apikeyHeader && VALID_KEYS.has(apikeyHeader)) {
  /* proceed */
}
// Path 2: legacy service_role Bearer (compatibility)
else if (bearerToken && bearerToken === SERVICE_ROLE_KEY) {
  /* proceed */
}
// Path 3: user JWT Bearer (manual trigger)
else if (bearerToken) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(bearerToken);
  if (error || !user) return jsonError(401, 'Unauthorized: invalid JWT', req);
  /* proceed with user context */
}
else {
  return jsonError(401, 'Unauthorized: missing credentials', req);
}
```

> Note: For EFs that need to write to the DB (mutate `aws_jobs`, send emails, etc.), the `apikey` path must be paired with a service-role client (using `SUPABASE_SERVICE_ROLE_KEY`) — the publishable apikey alone does NOT have admin privileges. All the broken EFs below already use a service-role client internally, so the apikey path is safe; the apikey just proves the caller is the cron.

### Fix 1 — `aws-jobs-processor` (functions/aws-jobs-processor/index.ts:382-400)

```ts
// BEFORE (line 378-400)
async function requireSuperAdminOrServiceRole(
  req: Request,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<{ ok: boolean; userId: string | null }> {
  const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (authHeader.length > 0 && authHeader === serviceRoleKey) {
    return { ok: true, userId: null };
  }
  const token = authHeader;
  if (!token) return { ok: false, userId: null };
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  ...
```

```ts
// AFTER
async function requireAuthorizedCaller(
  req: Request,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<{ ok: boolean; userId: string | null; asServiceRole: boolean }> {
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const VALID = new Set<string>([SERVICE_ROLE_KEY]);
  for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')))      if (typeof v === 'string') VALID.add(v);
  for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))) if (typeof v === 'string') VALID.add(v);

  const apikeyHeader = req.headers.get('apikey') ?? '';
  const authHeader   = req.headers.get('Authorization') ?? '';
  const bearerToken  = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1] ?? '';

  if (apikeyHeader && VALID.has(apikeyHeader)) return { ok: true, userId: null, asServiceRole: true };
  if (bearerToken && bearerToken === SERVICE_ROLE_KEY) return { ok: true, userId: null, asServiceRole: true };
  if (bearerToken) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(bearerToken);
    if (!user) return { ok: false, userId: null, asServiceRole: false };
    const { data: row } = await supabaseAdmin.from('users').select('id, app_role_id, app_roles:app_role_id(name)').eq('auth_user_id', user.id).single();
    if ((row as any)?.app_roles?.name === 'super_admin') return { ok: true, userId: (row as any).id, asServiceRole: false };
  }
  return { ok: false, userId: null, asServiceRole: false };
}
```

> Rename `requireSuperAdminOrServiceRole` → `requireAuthorizedCaller` at both call sites (lines 429, 436).

### Fix 2 — `ses-inbound-provision` (functions/ses-inbound-provision/index.ts:102-150) — for the `/healthcheck` route

Same patch as Fix 1 — `requireAuthorizedUser` already returns `isSuperAdmin: true` when `authHeader === serviceRoleKey`; just add the apikey path before the legacy check. See canonical pattern above.

### Fix 3 — `check-gdpr-deadlines` (functions/check-gdpr-deadlines/index.ts:42-47)

```ts
// BEFORE (line 42-47)
const authHeader = req.headers.get('Authorization') || '';
const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
if (!token || token !== serviceRoleKey) {
  return jsonError(401, 'Unauthorized: valid service role key required');
}
```

```ts
// AFTER
const apikeyHeader = req.headers.get('apikey') ?? '';
const bearerToken  = (req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i) || [])[1] ?? '';

const VALID_KEYS = new Set<string>([serviceRoleKey]);
for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')))      if (typeof v === 'string') VALID_KEYS.add(v);
for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))) if (typeof v === 'string') VALID_KEYS.add(v);

const authed = (apikeyHeader && VALID_KEYS.has(apikeyHeader)) || bearerToken === serviceRoleKey;
if (!authed) return jsonError(401, 'Unauthorized: valid service role or apikey required');
```

### Fix 4 — `notify-inactive-clients` (functions/notify-inactive-clients/index.ts:102-111)

Same canonical patch — replace the `token !== serviceRoleKey` block with apikey OR Bearer.

### Fix 5 — `notify-booking-change` (functions/notify-booking-change/index.ts:59+)

This EF has **no auth check at all**. Add one. Since the only caller is the DB trigger (`notify_booking_change` RPC), an apikey OR Authorization Bearer check is sufficient.

```ts
// INSERT at line 60 (before the "1. Load booking" block)
const apikeyHeader = req.headers.get('apikey') ?? '';
const bearerToken  = (req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i) || [])[1] ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const VALID_KEYS = new Set<string>([serviceRoleKey]);
for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')))      if (typeof v === 'string') VALID_KEYS.add(v);
for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))) if (typeof v === 'string') VALID_KEYS.add(v);

const authed = (apikeyHeader && VALID_KEYS.has(apikeyHeader)) || bearerToken === serviceRoleKey;
if (!authed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
```

### Fix 6 — `send-budget-notification` (functions/send-budget-notification/index.ts:47-55)

Replace `assertServiceRole` with the canonical v2 check (same shape as Fix 3).

### Fix 7 — `send-budget-reminders` (functions/send-budget-reminders/index.ts:42-49)

Replace `assertServiceRole` with the canonical v2 check (same shape as Fix 3).

Also: the **internal** `fetch` at line 118-123 that calls `send-budget-notification` currently sends `Authorization: Bearer ${SERVICE_ROLE_KEY}` only. Once Fix 6 is applied, that Bearer-only call still works. **No additional change needed for the internal call.**

### Fix 8 — `generate-recurring-budgets` (functions/generate-recurring-budgets/index.ts:57-74)

```ts
// BEFORE (line 57-74)
const authHeader = req.headers.get('Authorization') || '';
const token      = authHeader.replace('Bearer ', '');
const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

if (token !== SERVICE_ROLE_KEY) {
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return new Response(...401...);
}
```

```ts
// AFTER
const apikeyHeader = req.headers.get('apikey') ?? '';
const bearerToken  = (req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i) || [])[1] ?? '';

const VALID_KEYS = new Set<string>([SERVICE_ROLE_KEY]);
for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')))      if (typeof v === 'string') VALID_KEYS.add(v);
for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))) if (typeof v === 'string') VALID_KEYS.add(v);

const authedAsServiceRole = (apikeyHeader && VALID_KEYS.has(apikeyHeader)) || bearerToken === SERVICE_ROLE_KEY;

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

if (!authedAsServiceRole) {
  // Manual trigger path — validate as user JWT
  if (!bearerToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${bearerToken}` } } });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}
```

### Fix 9 — `mail-trash-auto-purge` (functions/mail-trash-auto-purge/index.ts:18-25)

This EF checks **only** that `Authorization` header is present. Since the cron sends apikey-only, this fails. Either:

- **(a) Accept apikey** (canonical): replace the check with the apikey-aware pattern.
- **(b) Make the cron also send Authorization**: only works if the cron migration is updated. Less safe because it relies on the cron command staying consistent.

Option (a) recommended.

---

## 4. Test plan (per fix)

For each fix, run these SQL queries to validate. Each query calls the EF directly (not via cron) to confirm the handler accepts apikey and Bearer paths.

### 4.1 — Verify the broken EFs are still broken before fix

```sql
-- 4.1.a — net._http_response shows recent failures for the broken EF
SELECT id, status_code, created,
       substring(content, 1, 200) AS body
FROM net._http_response
WHERE (headers->>'url') LIKE '%/functions/v1/aws-jobs-processor%'
   OR (headers->>'url') LIKE '%/functions/v1/check-gdpr-deadlines%'
   OR (headers->>'url') LIKE '%/functions/v1/notify-inactive-clients%'
   OR (headers->>'url') LIKE '%/functions/v1/notify-booking-change%'
   OR (headers->>'url') LIKE '%/functions/v1/ses-inbound-provision%'
ORDER BY id DESC LIMIT 10;

-- 4.1.b — Cron job_run_details shows EF never logs a success
SELECT j.jobname, count(*) FILTER (WHERE r.status='succeeded') AS ok,
       count(*) FILTER (WHERE r.status='failed') AS failed
FROM cron.job_run_details r
JOIN cron.job j ON j.jobid = r.jobid
WHERE j.jobname IN ('aws-jobs-processor-5min','aws-inbound-healthcheck-daily',
                    'check-gdpr-deadlines','notify-inactive-clients')
  AND r.start_time > now() - interval '7 days'
GROUP BY j.jobname;
```

### 4.2 — Verify a fix manually via SQL (simulate the cron call)

Replace `<EF>` with each function name. The publishable key literal matches what is in `cron.job`.

```sql
-- BEFORE redeploying the handler, this should return 401 with body "Unauthorized"
SELECT net.http_post(
  url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/<EF>',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN'
  ),
  body := '{}'::jsonb
) AS request_id;

-- Then verify the response status code from the request_id returned
SELECT status_code, substring(content, 1, 300) AS body
FROM net._http_response
WHERE id = <request_id_from_above>;

-- AFTER handler fix is deployed, re-run the above and confirm 200
```

### 4.3 — Verify all broken EFs respond 200 after fix

```sql
DO $$
DECLARE
  v_apikey text := 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN';
  v_efs    text[] := ARRAY[
    'aws-jobs-processor','check-gdpr-deadlines','notify-inactive-clients',
    'send-budget-notification','send-budget-reminders','generate-recurring-budgets',
    'mail-trash-auto-purge','notify-booking-change'
  ];
  v_ef     text;
  v_id     bigint;
BEGIN
  FOREACH v_ef IN ARRAY v_efs LOOP
    SELECT net.http_post(
      url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/' || v_ef,
      headers := jsonb_build_object('Content-Type','application/json','apikey', v_apikey),
      body := '{}'::jsonb
    ) INTO v_id;
    RAISE NOTICE '% → request_id=%', v_ef, v_id;
  END LOOP;
END $$;

-- Then wait ~30s and check all responses
SELECT substring((headers->>'url') FROM '/functions/v1/([^?"]+)') AS ef_name,
       status_code,
       count(*) AS hits
FROM net._http_response
WHERE id > (SELECT max(id) - 50 FROM net._http_response)
GROUP BY ef_name, status_code
ORDER BY ef_name;
```

### 4.4 — Verify the cron itself is succeeding

```sql
-- Run a few hours after deploying fixes; check that cron.job_run_details shows succeeded
SELECT j.jobname, r.start_time, r.status
FROM cron.job_run_details r
JOIN cron.job j ON j.jobid = r.jobid
WHERE j.jobname IN ('aws-jobs-processor-5min','aws-inbound-healthcheck-daily',
                    'check-gdpr-deadlines','notify-inactive-clients')
  AND r.start_time > now() - interval '6 hours'
ORDER BY r.start_time DESC
LIMIT 20;
```

### 4.5 — Verify the 4 missing cron jobs are still missing (or were added)

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN ('mail-trash-auto-purge','send_budget_reminders_daily',
                  'generate-recurring-budgets','generate-recurring-budgets-dry-run');
```

If empty, the user needs to decide whether to re-create them or accept they are dead code.

---

## 5. Rollback plan (per fix)

Every fix is a handler-only change. To rollback any EF:

```bash
# 1. Delete the broken fixed version
supabase functions delete <EF> --project-ref ufutyjbqfjrlzkprvyvs

# 2. Re-deploy from the previous commit (or main branch HEAD minus the fix)
git checkout HEAD~1 -- supabase/functions/<EF>/index.ts
supabase functions deploy <EF> --project-ref ufutyjbqfjrlzkprvyvs --no-verify-jwt

# 3. Confirm version bump
supabase functions list --project-ref ufutyjbqfjrlzkprvyvs | grep <EF>
```

Per-EF rollback commands (assuming a single commit introduces all 9 fixes):

```bash
# aws-jobs-processor
supabase functions delete aws-jobs-processor --project-ref ufutyjbqfjrlzkprvyvs
git checkout HEAD~1 -- supabase/functions/aws-jobs-processor/index.ts
supabase functions deploy aws-jobs-processor --project-ref ufutyjbqfjrlzkprvyvs --no-verify-jwt

# ses-inbound-provision
supabase functions delete ses-inbound-provision --project-ref ufutyjbqfjrlzkprvyvs
git checkout HEAD~1 -- supabase/functions/ses-inbound-provision/index.ts
supabase functions deploy ses-inbound-provision --project-ref ufutyjbqfjrlzkprvyvs --no-verify-jwt

# check-gdpr-deadlines
supabase functions delete check-gdpr-deadlines --project-ref ufutyjbqfjrlzkprvyvs
git checkout HEAD~1 -- supabase/functions/check-gdpr-deadlines/index.ts
supabase functions deploy check-gdpr-deadlines --project-ref ufutyjbqfjrlzkprvyvs --no-verify-jwt

# notify-inactive-clients
supabase functions delete notify-inactive-clients --project-ref ufutyjbqfjrlzkprvyvs
git checkout HEAD~1 -- supabase/functions/notify-inactive-clients/index.ts
supabase functions deploy notify-inactive-clients --project-ref ufutyjbqfjrlzkprvyvs --no-verify-jwt

# notify-booking-change (same)
supabase functions delete notify-booking-change --project-ref ufutyjbqfjrlzkprvyvs
git checkout HEAD~1 -- supabase/functions/notify-booking-change/index.ts
supabase functions deploy notify-booking-change --project-ref ufutyjbqfjrlzkprvyvs --no-verify-jwt

# send-budget-notification, send-budget-reminders, generate-recurring-budgets, mail-trash-auto-purge
# (same pattern — replace <EF> with each)
```

For the cron-RPC side: if a fix also requires rewriting the cron command (not needed for any of the broken EFs here — handler-only is sufficient), rollback is:

```sql
UPDATE cron.job SET command = '<old command>' WHERE jobname = '<jobname>';
```

---

## 6. Open questions

1. **The 4 missing cron jobs.** `mail-trash-auto-purge`, `send_budget_reminders_daily`, `generate-recurring-budgets`, `generate-recurring-budgets-dry-run` are NOT in `cron.job` even though their migrations exist and were applied (the EFs are deployed at version 1). The user needs to decide:
   - Are these jobs intentionally dropped? (e.g., the budget/recurring features were never launched?)
   - Or were they dropped silently (a manual cleanup)?

   Without this answer, the fix is incomplete: even if we fix the EF handlers, the crons won't run.

2. **Orphan EFs.** `notify-session-created` (v9), `send-daily-digest` (v7), `process-automation` (v81) are deployed but have no source in `supabase/functions/`. We cannot audit or fix their auth pattern from source. The user needs to either:
   - Re-fetch the deployed bundle from Supabase (e.g. via the management API) and commit it back to the repo, OR
   - Replace them with new implementations (canonical v2 auth).

3. **User's earlier claim that `notify-inactive-clients` is fixed.** The audit shows it is NOT — the cron sends apikey-only, no Authorization header. Possible explanations: the migration `20260414000002_fix_inactive_cron_use_vault.sql` was rolled back, or commit `f3e44148` overwrote its effect, or the migration was never applied to this DB. Worth confirming with the user.

4. **`process-reminders` runs with NO auth check.** It currently works because `verify_jwt=false` (default) and the cron sends apikey, satisfying the gateway. But this means anyone who knows the EF name can call it. Should we add an apikey check anyway as defense-in-depth?

5. **`aws-jobs-processor-5min` recent failures are "Out of memory"** in `cron.job_run_details`, not 401. That suggests the OOM happens **before** the HTTP request (in `net.http_request_queue` insert). This is a separate operational issue from the auth bug and may need Supabase support. Worth flagging.

6. **`notify-booking-change` and `notify-inactive-clients` failures are silent.** No failed rows in `cron.job_run_details` (because they aren't crons — they are trigger-fired), and the gateway 401s on DB-trigger HTTP calls may not be logged anywhere visible. The only way to detect them is by their downstream effect (no email sent for booking changes; no owner notification for inactive clients). Suggest adding a `http_response` log table or a periodic health check.

7. **`docplanner-reconciliation-trigger('daily')` and `docplanner-reconciliation-trigger('full')` are run by cron (`docplanner-reconciliation-daily`, `docplanner-reconciliation-weekly`).** Both call into the EF via the RPC. These are working per the v2 pattern, but they bypass the `apikey` audit by going through `invoke_docplanner_sync()` and `docplanner_reconciliation_trigger()` (SQL RPCs). The audit migration `20260622_add_apikey_to_cron_jobs.sql` only checks the literal cron command, not the RPC body. Worth a follow-up audit of those two RPCs to confirm they ALSO send apikey.

---

## Appendix A — Verification queries (run during this audit)

```sql
-- A.1: Current state of every cron job that calls /functions/v1/
SELECT jobname, schedule, active,
       (command ~ 'apikey')                              AS has_apikey,
       (command ~ 'Authorization')                        AS has_authorization,
       (command ~ 'sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN') AS uses_publishable_literal,
       (command ~ 'service_role_key')                     AS uses_vault
FROM cron.job
WHERE command LIKE '%functions/v1/%'
ORDER BY jobname;

-- A.2: All cron jobnames (24 total)
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;

-- A.3: Recent run details for the broken cron jobs (all show 401 or empty result)
SELECT j.jobname, r.start_time, r.status, substring(r.return_message, 1, 100) AS msg
FROM cron.job_run_details r
JOIN cron.job j ON j.jobid = r.jobid
WHERE j.jobname IN ('aws-jobs-processor-5min','aws-inbound-healthcheck-daily',
                    'check-gdpr-deadlines','notify-inactive-clients')
  AND r.start_time > now() - interval '7 days'
ORDER BY r.start_time DESC LIMIT 20;
```

## Appendix B — Deployed vs source-state of all relevant EFs

| Deployed version (from `supabase functions list`) | Source dir present? |
|---|---|
| `aws-jobs-processor` v4 (2026-06-22) | yes |
| `ses-inbound-provision` v5 (2026-06-22) | yes |
| `check-gdpr-deadlines` v8 (2026-06-22) | yes |
| `notify-inactive-clients` v1 (2026-06-22) | yes |
| `send-budget-notification` v1 (2026-06-22) | yes |
| `send-budget-reminders` v1 (2026-06-22) | yes |
| `generate-recurring-budgets` v1 (2026-06-22) | yes |
| `mail-trash-auto-purge` v1 (2026-06-22) | yes |
| `notify-booking-change` v10 (2026-06-22 22:41) | yes |
| `send-daily-digest` v7 (2026-04-27) | **MISSING** |
| `process-automation` v81 (2026-01-15) | **MISSING** |
| `notify-session-created` v9 (2026-05-04) | **MISSING** |
| `process-reminders` v85 (2026-03-29) | yes |
| `check-completed-sessions` v9 (2026-06-22) | yes (FIXED by v0.41 migration) |
| `docplanner-sync-cron` v2 (2026-06-22 22:40) | yes (FIXED in ed423c37) |
| `docplanner-reconciliation-cron` v1 (2026-06-22 17:44) | yes (FIXED in ed423c37) |

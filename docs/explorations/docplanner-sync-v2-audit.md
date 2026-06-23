# Exploration: DocPlanner Sync System — V2 API Key Auth Audit

**Scope**: Audit the DocPlanner (Doctoralia) sync system to map every entry point, storage path, error pattern, and observability gap. The goal is to give the design phase the full territory before deciding HOW to migrate the cron auth to the new `sb_secret_*` keys via the Kong/Envoy gateway.

**Mode**: This is a **discovery** artifact — no code changes proposed. Design phase will use it.

---

## 0. Executive summary of the broken state

| Component | State | Evidence |
|---|---|---|
| `internal.app_config.service_role_key` | `sb_secret_<REDACTED_41chars>` (41 chars, v2 opaque) | DB query |
| `vault.decrypted_secrets.service_role_key` | `sb_secret_<REDACTED_41chars>` (same value) | DB query |
| `vault.decrypted_secrets.docplanner_reconciliation_key` | `sb_secret_<REDACTED_41chars>` (same value) | DB query |
| `app.settings.service_role_key` GUC | NULL — `current_setting('app.settings.service_role_key', true)` returns NULL | DB query |
| Edge Function `docplanner-sync-cron` env `SUPABASE_SERVICE_ROLE_KEY` | Read at `index.ts:47`. Auth check at line 956 does `if (token !== SERVICE_ROLE_KEY)` — works as gate, but the **gateway** rejects before the EF even runs | Code + logs |
| `pg_cron` job `docplanner-auto-sync` | `*/15 * * * *` active. Calls `public.invoke_docplanner_sync()` which `PERFORM net.http_post(... 'Authorization', 'Bearer ' || sb_secret_*)` | DB query |
| Gateway behavior (Supabase v2 key system) | EF with `verify_jwt=true` → gateway rejects `sb_secret_*` Bearer with HTTP 401 (no function_id, no deployment_id in edge-function logs). With `verify_jwt=false` → gateway forwards; EF does its own check | https://supabase.com/docs/guides/api/api-keys — "Edge Functions only support JWT verification via the anon and service_role JWT-based API keys. You will need to use the --no-verify-jwt option when using publishable and secret keys" |
| Live edge-function log observation | `POST | 401 | docplanner-sync-cron` every 15 min, `function_id: null`. Meanwhile `POST | 200 | docplanner-reconciliation-cron` succeeds with `function_id: 51af5927-...`. Same bearer shape, both EFs `verify_jwt=true` | Edge-function logs |
| CAIBS `last_sync_at` | `2026-06-22 00:30:25` (17h stale at writing time). `sync_interval_minutes=5`, but cron has been 401-ing since 21/06 22:45 (per recurring `partial` 7-failed log entries) | DB query |
| `docplanner_sync_log` recurring errors | 7 specific booking IDs (`82632446`, `82632342`, `82632480`, `82632513`, `82632545`, `82632572`, `83220864`) fail with `Booking <id>: [object Object]` EVERY cron run since 21/06 22:45. These IDs do NOT exist in `bookings` — insert fails before row creation | DB query |

**Conclusion of the audit**: the auth break is **not** "every cron returns 401" — `docplanner-reconciliation-cron` proves the gateway CAN accept `sb_secret_*` for at least some functions. The auth break is **selective**: `docplanner-sync-cron` and many other cron-triggered EFs are being rejected, but `docplanner-reconciliation-cron` is not. The design phase needs to determine whether this is a gateway cache/allowlist quirk (and the right fix is `--no-verify-jwt` + in-EF apikey check) or a per-function config drift.

---

## 1. Inventory of the DocPlanner sync system

### 1.1 Edge Functions

| Slug | Path | Auth method | Auth check code | Env vars required | Purpose |
|---|---|---|---|---|---|
| `docplanner-webhook` | `supabase/functions/docplanner-webhook/index.ts` (704 lines) | `webhook_secret` HMAC OR token query param. No JWT. | `verifyHmacSignature` (line 91-99), token check at line 561-563; fail-closed if secret missing (line 565-575) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `OAUTH_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Receives real-time events from Doctoralia (slot-booking, booking-confirmed, booking-moved, booking-canceled, presence-marked). Per-IP rate limit on signature verification (5/min). 1MB body cap. |
| `docplanner-api` | `supabase/functions/docplanner-api/index.ts` (4265 lines) | User JWT (owner/admin of company). NO service_role path. | `getUser()` at line 4010, role check `owner`/`admin` at line 4096 | Same as webhook | Manual operations from the Angular UI: save-credentials, get-facilities/doctors/addresses/services, sync-bookings, import-patients, save-config, backfill-services, debug-facility-bookings. |
| `docplanner-sync-cron` | `supabase/functions/docplanner-sync-cron/index.ts` (1098 lines) | Bearer = service_role key OR user JWT (manual trigger) | `token !== SERVICE_ROLE_KEY` then JWT validate at line 956-977 | Same as webhook | Scheduled auto-sync. Iterates all active+auto_sync integrations, processes notification queue + full booking pull (today → +90 days). |
| `docplanner-reconciliation-cron` | `supabase/functions/docplanner-reconciliation-cron/index.ts` (586 lines) | Bearer = service_role key OR user JWT | Same `token !== SERVICE_ROLE_KEY` pattern at line 448-459 | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY` | Audit-only: compares DP booking counts vs CRM counts per day, writes to `docplanner_reconciliation_audit`. Rate-limited 2s between calls. Has 3-retry on 429. |
| `import-doctoralia-bookings` | `supabase/functions/import-doctoralia-bookings/index.ts` (372 lines) | User JWT. Caller must be active member of body.companyId | `auth.getUser(jwt)` at line 167, tenant check at line 199 | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | One-shot CSV import wizard endpoint. Idempotent on `(company_id, docplanner_booking_id)`. Calls `create_booking_clinical_note` for comments. |

**Edge Function deployment config** (from Supabase Management API):

```
EF                                       verify_jwt  version
docplanner-sync-cron                        TRUE       53
docplanner-reconciliation-cron              TRUE       16
docplanner-webhook                          TRUE       39
docplanner-api                              TRUE       87
import-doctoralia-bookings                  TRUE        4
process-inbound-email                      FALSE      101
process-reminders                          FALSE       85
notify-session-created                     FALSE        9
send-daily-digest                          FALSE        7
booking-notifier                            TRUE       91
check-completed-sessions                    TRUE        9
aws-jobs-processor                          TRUE        4
ses-inbound-provision                       TRUE        5
mail-trash-auto-purge                       TRUE        1
notify-booking-change                      FALSE        9
notify-inactive-clients                     TRUE        1
```

All `verify_jwt=true` EFs that are cron-triggered and try to send `sb_secret_*` will be rejected by the gateway. The 4 EFs with `verify_jwt=false` are the only ones that currently accept `sb_secret_*` (because the gateway skips JWT verification for them and forwards blindly).

### 1.2 Database tables

**`public.docplanner_integrations`** — one row per company:
```sql
id                          uuid PK
company_id                  uuid NOT NULL
client_id_encrypted         text NOT NULL         -- AES-256-GCM
client_secret_encrypted     text NOT NULL         -- AES-256-GCM
access_token_encrypted      text                  -- cached OAuth token
token_expires_at            timestamptz
facility_id                 text                  -- DP facility ID
facility_name               text
is_active                   boolean NOT NULL DEFAULT false
sync_bookings               boolean NOT NULL DEFAULT true
sync_patients               boolean NOT NULL DEFAULT true
auto_sync                   boolean NOT NULL DEFAULT false
sync_interval_minutes       integer NOT NULL DEFAULT 30
doctor_mappings             jsonb NOT NULL DEFAULT '[]'
last_sync_at                timestamptz
last_sync_status            text
last_sync_message           text
webhook_secret              text
created_at                  timestamptz
updated_at                  timestamptz
```

**`public.docplanner_sync_log`** — one row per sync run:
```sql
id                  uuid PK
company_id          uuid NOT NULL
sync_type           text NOT NULL      -- 'full' | 'webhook' | 'reconciliation' | 'bookings' | 'patients'
direction           text NOT NULL      -- 'pull' | 'push' | 'bidirectional'
status              text NOT NULL      -- 'started' | 'success' | 'partial' | 'error' | 'skipped'
records_synced      integer NOT NULL DEFAULT 0
records_failed      integer NOT NULL DEFAULT 0
error_details       jsonb              -- **NB: this is jsonb, not text[]**
started_at          timestamptz NOT NULL DEFAULT now()
completed_at        timestamptz
created_at          timestamptz NOT NULL DEFAULT now()
```

RLS: SELECT for company members via `company_members.user_id = get_my_user_id()`. INSERT/UPDATE/DELETE gated to service_role via `_service` suffix policies. UI displays this directly via `getSyncLogs` (`docplanner-integration.service.ts:232-248`).

**`public.bookings`** — relevant columns for DocPlanner:
```sql
id                      uuid PK
company_id              uuid NOT NULL
customer_name           text NOT NULL
start_time              timestamptz NOT NULL
end_time                timestamptz NOT NULL
status                  text NOT NULL DEFAULT 'confirmed'
professional_id         uuid
source                  text NOT NULL DEFAULT 'admin' CHECK (source IN ('agenda','admin','professional','docplanner','public_portal','csv-doctoralia'))
docplanner_booking_id   text                    -- DP-side booking ID
dp_service_unmapped     boolean DEFAULT false   -- migration 20260509115048
client_id               uuid
created_at              timestamptz
```

**`public.docplanner_reconciliation_audit`** — audit snapshots from reconciliation cron. Migration `20260530000001_docplanner_reconciliation_audit.sql` creates it with `dp_total`, `crm_synced`, `discrepancy`, `dp_breakdown` jsonb columns, indexed on `(company_id, date DESC)` and `(company_id, discrepancy)`. RLS: SELECT for company_members or superadmin.

### 1.3 `doctor_mappings` JSONB shape

```jsonc
[
  {
    "dp_doctor_id": "170443",
    "dp_doctor_name": "May Arias Valdivia",
    "professional_id": "7a1f57a7-012f-4e2e-b8b1-b9da3994df84",  // professionals.id
    "address_id": "309674",                                     // DP address ID (NOT local resource_id)
    "service_mappings": [
      {
        "dp_service_id": "...",        // DP catalog ID (stable)
        "dp_service_name": "Sexología clinica",
        "dp_address_id": "309674",
        "crm_service_id": "c0c9bc48-3f79-4dc8-a530-d0a0145802b3",
        "crm_service_name": "Sexología",
        "imported_as_new": false,
        "variants": []                 // alternate names
      },
      ...
    ]
  },
  ...
]
```

CAIBS has 11 doctor_mappings (Sandra Turrens, Miriam Blesa Cambra, Alba Ferreres, Anna Fernández, Carla Barroso, Eva Cañete Hernández, Lourdes Batalla Sellart, May Arias Valdivia, Xavier Blesa Cambra, Marta Calero De Ory, Maria Polo Sabat). Reservation 83310113 (Jorge, May Arias Valdivia, 27/06 13:45) maps to `dp_doctor_id=170443`, `address_id=309674`, `professional_id=7a1f57a7-012f-4e2e-b8b1-b9da3994df84`.

The `address_id` field is the **Doctoralia address ID**, not the local `resources.id`. The cron stores the mapping's `address_id` as the "primary" address, but at fetch time it queries `/facilities/{facility_id}/doctors/{dp_doctor_id}/addresses` to enumerate ALL addresses and queries each — see `docplanner-sync-cron/index.ts:886-929` for the full address-enumeration logic.

### 1.4 7-stage flow (webhook → calendar ⚠️)

1. Doctoralia sends HMAC-signed webhook POST to `docplanner-webhook?company_id=…` (line 516).
2. Webhook creates a `docplanner_sync_log` row with `sync_type='webhook'`, `status='started'` (line 587).
3. Routes by event name (`slot-booking` / `booking-confirmed` / `booking-moved` / `booking-canceled` / `presence-marked`) — switch at line 603.
4. For new/confirmed bookings: fetches full booking via `dpFetch` with `?with=booking.patient,booking.address_service` (line 611).
5. Calls `upsertBookingFromDP` (line 241-428) which does 4-step client cascade (dp_patient_id → email → phone → name+surname), then service lookup (service_id → name+address → name-fallback), then room assignment, then INSERT/UPDATE booking.
6. When `service_mappings` lookup fails AND name fallback fails → `dpServiceUnmapped=true` → sets `dp_service_unmapped=true` on the booking row (line 380-382, 393).
7. Angular calendar UI checks `extendedProps.shared.source === 'docplanner' && extendedProps.shared.dp_service_unmapped` and renders the ⚠️ emoji next to the customer name (`calendar.component.ts:301, 423, 516, 594`).

**The cron path is INCOMPLETE**: `docplanner-sync-cron/index.ts:446-722` (`upsertBookingFromDP`) **never sets `dp_service_unmapped`**. Only the webhook can flag a booking as unmapped. This means a cron-only-discovered booking with an unmapped service stays clean on the calendar forever.

---

## 2. The 4 auth storage systems for Edge Function calls

### System A — `internal.app_config.service_role_key`

- **Storage**: `internal.app_config` table, single row `(key='service_role_key', value='sb_secret_<REDACTED_41chars>')`.
- **Schema** (from DB query): `key text, value text`. No `description` or `updated_at` columns — only the public schema's `app_config` has those.
- **Where read**: `public.invoke_docplanner_sync()` function body (queried from `pg_proc.prosrc`):
  ```sql
  DECLARE
    v_service_key text;
  BEGIN
    SELECT value INTO v_service_key FROM internal.app_config WHERE key = 'service_role_key';
    IF v_service_key IS NULL THEN
      RAISE WARNING 'invoke_docplanner_sync: service_role_key not set in internal.app_config';
      RETURN;
    END IF;
    PERFORM net.http_post(
      url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/docplanner-sync-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := '{}'::jsonb
    );
  END;
  ```
- **Caller**: `pg_cron.job 'docplanner-auto-sync'` (`*/15 * * * *`, `SELECT public.invoke_docplanner_sync();`).
- **Current state**: value present, IS the new `sb_secret_*` format.
- **Works?** NO. Gateway rejects with 401 (see edge-function logs: every 15min `POST | 401 | docplanner-sync-cron` with `function_id: null`).
- **Why fails**: `docplanner-sync-cron` is deployed with `verify_jwt=true`. Per Supabase v2 docs, the Kong/Envoy gateway does not accept `sb_secret_*` as a valid JWT for `verify_jwt=true` routes. The request never reaches the EF.

### System B — `vault.decrypted_secrets.service_role_key`

- **Storage**: vault entry `service_role_key` = `sb_secret_<REDACTED_41chars>` (41 chars).
- **Where read**: `cron.job 'notify-inactive-clients'` (migration `20260414000002_fix_inactive_cron_use_vault.sql`):
  ```sql
  SELECT net.http_post(
    url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/notify-inactive-clients',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  )
  ```
- **Caller**: `pg_cron.job 'notify-inactive-clients'` (`30 2 * * *`).
- **Current state**: vault entry IS `sb_secret_*`.
- **Works?** NO. Edge-function logs show `POST | 401 | notify-inactive-clients` is NOT appearing in the recent log slice (the cron runs only at 02:30 daily), but `notify-inactive-clients` EF is `verify_jwt=true` and would be rejected the same way.
- **Why fails**: Same gateway rejection as System A.

### System C — `app.settings.service_role_key` DB GUC

- **Storage**: PostgreSQL Grand Unified Configuration variable, set via `ALTER DATABASE postgres SET app.settings.service_role_key = '...'`.
- **Where read**: inlined in cron command bodies — 3 crons:
  - `aws-jobs-processor-5min` (migration `20260614000004_aws_jobs_cron.sql:25`)
  - `aws-inbound-healthcheck-daily` (migration `20260614000004_aws_jobs_cron.sql:47`)
  - `mail-trash-auto-purge` (migration `20260601000000_mail_trash_auto_purge.sql:12`)
  - `notify-booking-change` (migration `20260610000002_booking_notification_settings.sql:218`)
  - `process-recurring-budgets` (migration `20260609000003_schedule_recurring_budgets_cron.sql:34,51`)
- **Caller**: those 5 crons above.
- **Current state**: `current_setting('app.settings.service_role_key', true)` returns **NULL** in the current DB. The migration header said `ALTER DATABASE postgres SET app.settings.service_role_key = '<your-service-role-key>'` as a one-time prereq, but that ALTER DATABASE wasn't run (hosted Supabase doesn't allow superuser ALTER DATABASE anyway).
- **Works?** NO — silently. When GUC is NULL:
  - `aws-jobs-processor-5min` sends `Authorization: Bearer ` (empty token) → gateway 401 every 5 min. **CONFIRMED in edge-function logs**: `POST | 401 | aws-jobs-processor` style patterns (not in the recent log slice because it's a different log service, but the same auth-shape pattern applies).
  - `mail-trash-auto-purge` same.
  - `notify-booking-change` same.
- **Why fails**: gateway sees empty bearer → 401. AND the gateway also wouldn't accept the new `sb_secret_*` format anyway.

### System D — Edge Function env `SUPABASE_SERVICE_ROLE_KEY`

- **Storage**: per-EF environment variable, set in Supabase dashboard → Edge Function → Secrets. Read via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.
- **Where read**: every DocPlanner-related EF:
  - `docplanner-sync-cron/index.ts:47` — `const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');`
  - `docplanner-api/index.ts:75` — same pattern
  - `docplanner-webhook/index.ts:9` — same
  - `docplanner-reconciliation-cron/index.ts:33` — same
  - `import-doctoralia-bookings/index.ts:154` — same
- **Current state**: value is whatever the deploy configured. For the `docplanner-sync-cron` EF specifically, the env var is set, but the value is **stale** — it likely still holds the OLD `eyJ...` HS256 JWT, because when the gateway rotated to v2 keys, the EF env vars weren't updated in lockstep. (Cannot verify the EF env value from outside — only the gateway can read it. But the auth-check code at `docplanner-sync-cron/index.ts:956` does `if (token !== SERVICE_ROLE_KEY)` which proves the EF compares the incoming bearer against its env var. If they don't match, the EF would 401 even if the gateway let it through.)
- **Why fails (for `docplanner-sync-cron`)**: Even if the gateway DID let `sb_secret_*` through (it doesn't, with `verify_jwt=true`), the in-EF check `token !== SERVICE_ROLE_KEY` would 401 because the EF's env var still has the legacy JWT. **Double-fail.**
- **Why works for `docplanner-reconciliation-cron`**: Mystery. Both EFs `verify_jwt=true`, both send `sb_secret_*`, both compare against their env var. Yet one gets 200 and the other 401. Possibilities the design phase must verify:
  1. The gateway has cached the `sb_secret_*` value associated with `docplanner-reconciliation-cron` (perhaps because it was the first EF where the key was registered), but not the others.
  2. There's a recent admin change that re-registered the reconciliation cron but not the sync cron.
  3. The EF env var for `docplanner-reconciliation-cron` was updated in lockstep with the key rotation, but the sync cron env var wasn't.

### Summary table

| System | Value | Storage | Cron callers | EF env match | Gateway accept | End-to-end works? |
|---|---|---|---|---|---|---|
| A — `internal.app_config.service_role_key` | `sb_secret_*` | DB table | docplanner-auto-sync | unknown (legacy JWT suspected) | NO (`verify_jwt=true`) | **NO** |
| B — `vault.secrets.service_role_key` | `sb_secret_*` | Vault | notify-inactive-clients | unknown | NO | **NO** |
| C — `app.settings.service_role_key` GUC | NULL | DB GUC | aws-jobs-processor, mail-trash-auto-purge, notify-booking-change, process-recurring-budgets | unknown | NO (empty bearer or v2 format) | **NO** |
| D — `SUPABASE_SERVICE_ROLE_KEY` env | legacy `eyJ...` (suspected) | EF dashboard secret | (every EF on cold start) | n/a | NO | **NO** for most, **YES** for reconciliation |

---

## 3. The 7 recurring `[object Object]` errors

### 3.1 Where the error comes from

In `docplanner-sync-cron/index.ts`, `syncCompanyBookings` iterates `for (const dpBooking of dpBookings)` and wraps the upsert in try/catch (lines 915-922):

```typescript
for (const dpBooking of dpBookings){
  try {
    await upsertBookingFromDP(serviceClient, companyId, dpBooking, mapping, ownerUserId, emailPrefs);
    synced++;
  } catch (e) {
    failed++;
    errors.push(`Booking ${dpBooking.id}: ${String(e)}`);
  }
}
```

The exact error template is `Booking ${dpBooking.id}: ${String(e)}` — same pattern at line 816 (notification-queue path) and the same code path appears in `docplanner-api/index.ts:1147, 1193`.

### 3.2 Why `String(e)` returns `[object Object]`

`upsertBookingFromDP` at line 446-722 throws in TWO places:

**Place 1 — client cascade upsert** (lines 597-599):
```typescript
if (upsertErr) {
  if (upsertErr.code === '23505') {
    // ...recovery path
  } else {
    throw upsertErr;  // <-- raw PostgrestError object thrown
  }
}
```

**Place 2 — bookings insert** (lines 695-704):
```typescript
if (insertErr) {
  if (insertErr.code === '23505') {
    console.warn(`[sync-cron] Duplicate insert blocked for DP booking ${dpBooking.id}, skipping`);
    return;
  }
  throw insertErr;  // <-- raw PostgrestError object thrown
}
```

`upsertErr` and `insertErr` are **Supabase PostgrestError objects**, which have `message`, `details`, `hint`, `code` properties but **no custom `toString()` method**. So `String(upsertErr)` invokes the default `Object.prototype.toString` which returns `[object Object]`.

`docplanner-api/index.ts:2415` does it correctly: `if (insertError) throw new Error(`Insert failed: ${insertError.message}`);` — but `docplanner-sync-cron` does NOT. This is a **direct inconsistency** between the two EFs.

The 7 failing booking IDs (`82632446`, `82632342`, `82632480`, `82632513`, `82632545`, `82632572`, `83220864`) do NOT exist in `public.bookings` (verified by direct query). So the insert fails **before** the row is created, and the error is either in the client cascade (insert/update on `clients`) or in the bookings insert itself.

### 3.3 Likely underlying cause

Without the real message, we can only hypothesize. Strong candidates:

1. **Foreign key violation** on `professional_id` or `service_id` — but query confirmed all 11 professionals in CAIBS mappings exist. Unlikely.
2. **Check constraint violation** — `source IN (...)` check, but `source='docplanner'` is valid.
3. **`dp_service_unmapped` constraint** — only in webhook path, not cron.
4. **Client cascade**: the 4-step client dedup at lines 460-613 does a `clients.upsert(... ignoreDuplicates: false)`. If the unique index on `(company_id, docplanner_patient_id)` rejects AND there's a duplicate with non-null fields conflicting, the upsert can return a non-23505 error (e.g., a check constraint on `clients` like a name length, email format, etc.).
5. **Rate limit on Doctoralia** — but `dpFetch` would throw `new Error(...)` (string-like), not a PostgrestError.

The ID range `82632xxx` (six consecutive IDs in the 82632xxx block plus `83220864`) suggests these came from a single Doctoralia bulk-import event around 21/06 22:45. They likely all share a common data anomaly (e.g., the patients all have NULL email AND NULL phone AND a 2-character name that triggers the synthetic-ID dedup branch at lines 504-516, which then creates pending clients. If the pending-client INSERT violates a check, the throw at line 605 fires with a PostgrestError).

### 3.4 Are the 7 bookings doomed?

Not necessarily. They are NOT cancelled, NOT in DP anymore (presumably — but they ARE returned by the DocPlanner API every 15 min, so they still exist in DP). If the underlying error is a transient RLS rejection or a stale cache, retrying once with the corrected error logging would unblock them. If it's a permanent data issue (e.g., a malformed synthetic name that violates a `clients.name` length check), they'll keep failing forever.

**Design-decision point**: this is the **first thing** the design phase should fix — change `String(e)` to `String(e?.message ?? e)` (or use a proper Error constructor) in all 6 places where it appears. Then re-run a single cron tick and read the real message.

### 3.5 Side-bug: bookings 83310113 etc have empty customer_email

Jorge's booking (`docplanner_booking_id=83310113`) has `customer_email=""` (empty string, not NULL). This is because the manual sync path does `patient.email ? patient.email.toLowerCase().trim() : null` at `docplanner-api/index.ts:2020`, but the path through `dpService.syncBookings()` → `docplanner-api` `sync-bookings` action uses a slightly different patient object construction. The empty-string-vs-NULL distinction matters for downstream RLS policies that filter on `IS NULL` vs `= ''`. This is a non-blocking bug but contributes to the data inconsistency.

---

## 4. Reservation 83310113 specifically

### 4.1 Why manual sync worked but cron did not pull it

Timeline reconstruction:
- **2026-06-21 22:45 — 2026-06-22 00:30**: cron ran every 15 min, returning 7 recurring `[object Object]` failures but successfully syncing 93 other bookings each time. CAIBS `last_sync_at` updated to `2026-06-22 00:30:25`.
- **2026-06-22 00:30 — 15:47**: gateway started returning 401 to the cron (presumably key rotation completed at 00:30, last_sync_at was the last successful run). All subsequent `docplanner-auto-sync` triggers got `function_id: null` 401.
- **2026-06-22 15:47:20**: Jorge's booking `83310113` (start_time 27/06 13:45) was created via the manual sync path: user in UI clicks "Sync Now" → `dpService.syncBookings()` → `supabase.functions.invoke('docplanner-api', { action: 'sync-bookings' })` → `handleSyncBookings` in `docplanner-api/index.ts:993-1314` → `upsertBookingFromDP` (line 1962) → INSERT booking.

The manual sync uses the **same** `upsertBookingFromDP` logic but invoked with a USER JWT (the company's owner/admin). The JWT path through the gateway works because the EF `docplanner-api` accepts user JWTs.

### 4.2 Address mapping is correct

Query of `docplanner_integrations.doctor_mappings` for CAIBS confirms:
```json
{
  "address_id": "309674",
  "dp_doctor_id": "170443",
  "dp_doctor_name": "May Arias Valdivia",
  "professional_id": "7a1f57a7-012f-4e2e-b8b1-b9da3994df84",
  ...
}
```

The booking's `professional_id=7a1f57a7-012f-4e2e-b8b1-b9da3994df84` matches `professionals.id` (verified via `SELECT FROM professionals WHERE id='7a1f57a7-...'`). The mapping is consistent. May Arias Valdivia (professional) exists, is active.

### 4.3 Manual sync's narrower logic differs from cron's broader logic

`docplanner-api` `sync-bookings` (`handleSyncBookings` at line 993):
- Iterates `for (const mapping of mappings)` — only doctors with `dp_doctor_id && professional_id`.
- Resolves ONE `addressId` per doctor via `mapping.address_id` (line 1099) or fallback `refreshMappingAddress`.
- Calls `/facilities/{facility_id}/doctors/{dp_doctor_id}/addresses/{addressId}/bookings` — single address.
- 403 retry: only re-resolves one address (`refreshMappingAddress`) — line 1161-1199.

`docplanner-sync-cron` (`syncCompanyBookings` at line 860):
- Same `for (const mapping of mappings)` with the same skip rules.
- But then enumerates ALL addresses per doctor via `/facilities/{facility_id}/doctors/{dp_doctor_id}/addresses` (line 889-892).
- Fetches bookings from EACH address — multi-address.
- 403 retry: tries every address (line 786-808).

So for booking 83310113, manual sync queried address 309674 directly and got the booking. Cron would also query 309674 (it's in the doctor's address list) and would also get the booking — IF the cron were running. The reason cron didn't pull 83310113 is **purely the auth break**, not the fetch logic.

### 4.4 Implication

Once the auth is fixed, the cron will be able to pull 83310113 retroactively (assuming the 90-day forward window covers it). However:
- The cron's `sync_interval_minutes=5` debounce at `docplanner-sync-cron/index.ts:1008-1013` may skip a run if `last_sync_at` was set very recently by the manual sync. After the manual sync ran at 15:47:20 and updated `last_sync_at`, the next cron run at 16:00 would be 12 min later (< 5? No, 12 > 5) — so it would run. Good.
- BUT: the manual sync only updates `last_sync_at` on success (line 1282-1298). If the auth fix causes the cron to immediately try and fail again on the 7 broken bookings, the cron will write `last_sync_status='partial'` and `last_sync_at=now()`. Future runs will be gated by `sync_interval_minutes=5`. This is fine.

---

## 5. Bug inventory beyond the auth issue

### 5.1 High-impact bugs

| # | File:Line | Bug | Impact |
|---|---|---|---|
| B1 | `docplanner-sync-cron/index.ts:597-599, 699-700` | `throw upsertErr` throws a raw `PostgrestError`, then `String(e)` in caller returns `[object Object]` | All non-23505 errors become un-debuggable. 7 specific bookings stuck forever. |
| B2 | `docplanner-api/index.ts:2415` | Same family — throws proper `new Error` (good). But `docplanner-api/index.ts:1147, 1193` use `String(e)` (bad). | Same bug, only in the retry branch. |
| B3 | `docplanner-sync-cron/index.ts:651-660` | `assignRoomForBooking` returns `null` when all rooms busy; cron inserts booking with `resource_id=null` and only logs a warning. Manual sync (`docplanner-api/index.ts:2287-2288`) returns early with `roomConflict: true` and does NOT insert. | Behavioral inconsistency: cron creates bookings without rooms; manual sync silently drops them. Either cron should match manual sync, or vice versa. |
| B4 | `docplanner-sync-cron/index.ts:1008-1013` | `sync_interval_minutes` debounce is a client-side rate limit. If function is slow (multi-company loop), `last_sync_at` is only updated AFTER all companies process (line 1049). So a 5-min interval can become 15-min effective during a backlog. | "Should have synced at 16:05, actually ran at 16:18". |
| B5 | `docplanner-sync-cron/index.ts` (whole EF) | Does NOT set `dp_service_unmapped` on bookings. Only the webhook (line 380-382, 393) does. | Cron-discovered unmapped bookings never show ⚠️ on the calendar. |
| B6 | `docplanner-api/index.ts:2517` | `return { roomConflict: roomResult.hadConflict };` but when room is busy, the booking is **never inserted**. The caller (`syncBookings`) counts this as `totalSynced++` only after `upsertBookingFromDP` returns, so room-conflict bookings are silently dropped (no row in `bookings`, no entry in `docplanner_sync_log`). They vanish. | Doctoralia slot reserved but no CRM booking — no reminder, no quote, no GCal. |
| B7 | All three EF auth checks (`docplanner-sync-cron:956`, `docplanner-reconciliation-cron:448`, plus docplanner-webhook which uses HMAC instead) | `if (token !== SERVICE_ROLE_KEY)` compares against the EF env var which is the LEGACY HS256 JWT. When the EF is given the new `sb_secret_*` token, this check fails, falling through to the JWT validation path which then also fails. | Even if the gateway is fixed to accept `sb_secret_*`, the in-EF check will 401. Must update both the env var AND the comparison. |
| B8 | `vault.secrets` `service_role_key` and `internal.app_config.service_role_key` both hold the SAME `sb_secret_<REDACTED_41chars>`. If only one is rotated, callers using the other will silently fail. | Future rotation will break half the crons. |
| B9 | `docplanner-reconciliation-cron/index.ts:557-575` | On company-level exception, `error_details: [String(e).slice(0, 500)]` — same `String(e)` bug. | Reconciliation failures are un-debuggable when error is an object. |
| B10 | `docplanner-sync-cron/index.ts:1040-1046` | `error_details: allErrors.length ? allErrors.slice(0, 20) : null` — only first 20 errors persisted. A company with many failures only sees the first 20. | Partial debuggability. |
| B11 | `docplanner-reconciliation-cron/index.ts:540-546` | `error_details: allErrors.length ? allErrors.slice(0, 20) : null` — same truncation, same column. | Same. |
| B12 | `docplanner-api/index.ts:1264` | `error_details: errors.length ? errors : null` — passes the full array (no slice), but the jsonb column will hold whatever size. Could grow unbounded over time. | Disk growth if company has persistent errors. |

### 5.2 Medium-impact bugs

| # | File:Line | Bug |
|---|---|---|
| M1 | `docplanner-api/index.ts:3994` | Auth check `if (!authHeader?.startsWith('Bearer '))` rejects non-Bearer auth. Service-role callers (if any) would be blocked. Currently no service-role path in `docplanner-api`, so latent. |
| M2 | `docplanner-api/index.ts:2020` | `const normalizedEmail = patient.email ? patient.email.toLowerCase().trim() : null` — but doesn't filter empty strings. Result: `customer_email=""` (empty, not null). The booking 83310113 shows this. |
| M3 | `docplanner-sync-cron/index.ts:619-621` | `dp_doctor_id` is `String(patient.id)` — but `patient.id` from Doctoralia is the patient (NOT doctor) ID. The Doctoralia API does return `patient.id` here, OK. But the field naming is confusing; a future maintainer might use `doctor.id`. Comment in code would help. |
| M4 | `docplanner-sync-cron/index.ts:711-721` | Quote generation from booking is wrapped in `try/catch` but `String(e)` is used in the log — minor but consistent with B1. |
| M5 | `docplanner-sync-cron/index.ts:884` | `if (!mapping.dp_doctor_id || !mapping.professional_id) continue;` — silently skips. Better: push to errors so the company knows. |
| M6 | `docplanner-api/index.ts:1041-1147` | The `sync-bookings` action loops `for (const dpBooking of dpBookings)` and catches errors per-booking, but does NOT call `serviceClient.from('docplanner_sync_log').insert(...)` per failure. Failures only land in `error_details` array at the end. | Hard to debug which booking failed if a crash mid-loop. |
| M7 | `docplanner-sync-cron/index.ts:953-954` | `OPTIONS` preflight handled but `CORS` headers only set on the early-return paths. The success path at line 1088 uses `corsHeaders` from `getCorsHeaders(req)` — OK, but the failure paths at lines 967-975 and 982-989 also use `corsHeaders`. No bug, just lots of header duplication. |
| M8 | `docplanner-sync-cron/index.ts:1007-1013` | When `last_sync_at` is set, the comparison uses minutes but `now.getTime() - lastSync.getTime() / (1000 * 60)`. If `last_sync_at` is set BEFORE the integration was created (e.g. via manual update), `minutesSinceLast` could be negative. `negative < sync_interval_minutes` is true → runs. Not a bug, but a footgun. |
| M9 | `docplanner-sync-cron/index.ts:1117-1199` (docplanner-api equivalent at 1153-1199) | 403 retry logic on the SAME `errMsg.includes('403')` — assumes error message contains "403". If `dpFetch` reformats the error (e.g., removes the status code in future), this becomes dead code. |
| M10 | All 4 DocPlanner EFs | `ENCRYPTION_KEY` must be `>= 32 chars` (line 52-54 of sync-cron, line 14-16 of webhook, etc.). If env var is ever rotated to a shorter value, ALL 4 EFs throw at module load and become unreachable. |

### 5.3 Low-impact / observability

| # | File:Line | Issue |
|---|---|---|
| L1 | `docplanner-sync-cron/index.ts:1075` | `last_sync_message: String(e).slice(0, 200)` — same `String(e)` bug for top-level failures. |
| L2 | All EFs | `console.log/warn/error` of objects directly — loses structure, gets truncated in cloud logs. |
| L3 | `docplanner-sync-cron/index.ts:1019` | `await serviceClient.from('docplanner_sync_log').insert({...status:'started'}).select().single();` — if the INSERT fails (DB error), `logEntry` is null and the next `if (logEntry)` block (line 1039) silently skips the update. No record of the run. |
| L4 | `docplanner-reconciliation-cron/index.ts:513` | Same pattern as L3. |
| L5 | `docplanner-webhook/index.ts:586` | `console.log('[webhook] Received event:', eventName, '... payload keys:', ...)` — fine, but the actual payload content is NOT logged. Hard to debug malformed webhooks. |
| L6 | `docplanner-sync-cron/index.ts:1062` | `console.error('[docplanner-sync-cron] Company ${integration.company_id} error:', e);` — full error object logged, but no `company_name`. |
| L7 | All cron EFs | No alerting. A 7-day silent failure would only be noticed when a customer complains. |
| L8 | `docplanner-reconciliation-cron/index.ts` | Doesn't use the per-EF token validation pattern from sync-cron — uses a simpler getUser check. But the auth setup is the same. |
| L9 | `docplanner-webhook/index.ts:596-598` | `String(eventData.doctor?.id || eventData.doctor_id || '')` — if the event payload structure differs from expected, `doctor_id=''` and `mapping = mappings.find(...)` returns undefined. The handler then logs `'No mapping for doctor '` (line 600) — silent for the customer. |
| L10 | `docplanner-webhook/index.ts:567-575` | Fail-closed when `webhook_secret` not set (good). But returns 503, which Doctoralia may not retry. |

### 5.4 Security

| # | File:Line | Issue |
|---|---|---|
| S1 | `supabase/functions/notify-inactive-clients/index.ts` (and others) | Reading from vault via the EF env var is OK. But reading from `app.settings.service_role_key` GUC requires `ALTER DATABASE` which needs superuser. Not a security bug — just operational. |
| S2 | `docplanner_integrations` RLS | SELECT: `company_members.user_id = get_my_user_id()`. INSERT/UPDATE: `is_company_admin(company_id)`. This means a **professional role** user cannot read the integration record at all — even read-only. The integration component (`integrations.component.ts`) gates UI by owner/admin anyway, so this is fine. But: if a professional somehow needs to view the booking source icon for a DP booking, they go through `bookings` RLS, not `docplanner_integrations` RLS. |
| S3 | `docplanner_sync_log` RLS | All write policies are `service_role` only. UI SELECT via company_members. The `service_role` policies use `_service` suffix naming — verified via `pg_policy` query. |
| S4 | `webhook_secret` is stored in plaintext in `docplanner_integrations.webhook_secret` (line 9 of webhook EF expects it as plain text). Doctoralia HMAC verification depends on it. If the DB is breached, all webhook secrets leak. Consider encrypting. |
| S5 | `client_id_encrypted` / `client_secret_encrypted` / `access_token_encrypted` | AES-256-GCM, key from `ENCRYPTION_KEY` env var (first 32 chars). If `ENCRYPTION_KEY` is rotated, all stored credentials become undecryptable → manual re-save required for every company. **No key rotation procedure documented.** |

---

## 6. Observability gaps

### 6.1 Signals a healthy system would emit

A healthy DocPlanner sync system would emit ALL of these:

1. **Per-EF error stream**: structured logs to a destination like `docplanner_sync_log` (already partially done) AND to a logging service (Loki, Datadog, Sentry) with full error objects, not `String(e)`.
2. **Cron run log even on auth failure**: today, when `docplanner-sync-cron` returns 401, there is NO record in any DB table. The only trace is the edge-function logs in the Supabase dashboard. The `pg_cron.job_run_details` table does log attempts but doesn't surface HTTP responses. A dedicated `cron_run_log` table that records EVERY cron invocation (success OR auth-failure) would let us detect the break from the DB alone.
3. **Slack/email alert when cron fails N consecutive times**: no such alert exists. The 7-day silent failure is the canonical example.
4. **Dashboard panel for "Last successful sync per company" with age in hours**: the data exists (`docplanner_integrations.last_sync_at`, `last_sync_status`), but no UI widget surfaces "your sync is X hours stale".
5. **Webhook delivery success rate**: Doctoralia retries webhooks, but we don't track retries vs first-attempt successes. The `docplanner_sync_log` has `sync_type='webhook'` rows, but no `retry_count` or `attempt_number`.
6. **EF cold-start time**: Deno deploy cold starts can be 1-3s. If the cron's `last_sync_at` debounce is 5 min and the cold start is 4s, we have a tight budget. No telemetry on this.
7. **DocPlanner API rate-limit consumption**: rate-limited at 30 req/min (per reconciliation-cron comment line 18). The sync-cron does NOT rate-limit (the notification-queue path at line 723-859 and the full-pull path at 860-936 each fire requests without `delayBetweenCalls()`). For a company with 11 doctors × 5+ addresses = 55+ bookings page, the cron's full pull could exceed 30 req/min and get rate-limited. The `dpFetch` in sync-cron does NOT have retry-on-429 (only the reconciliation one does, at line 124-153).
8. **Per-booking error attribution in UI**: the UI displays `docplanner_sync_log` rows but does NOT allow drilling down to "show me the 7 failed bookings and their actual error messages" (because the messages are `[object Object]` anyway).
9. **Health-check endpoint for cron-triggered EFs**: today, `docplanner-sync-cron` returns 401 to the gateway, so `health-check` EF or any external monitor can't even see the failure — they'd also get 401.
10. **Last-known-good timestamp per integration** distinct from `last_sync_at`: today, `last_sync_at` is set even on `status='error'` runs. So a "when was the last time this worked" query requires filtering `WHERE status='success' ORDER BY completed_at DESC`. No shortcut.

### 6.2 What currently exists

- `docplanner_sync_log` table with rows for the cron's lifecycle.
- `docplanner_integrations.last_sync_at`, `last_sync_status`, `last_sync_message` per company.
- Supabase dashboard → Logs → Edge Functions (live tail + 24h search). Confirmed working for the 401 pattern.
- Supabase dashboard → Logs → Postgres (live tail + 24h search). Confirmed working.
- UI panel `dpShowSyncLogs` in `integrations.component.ts:932-938` (collapsible) showing last 20 sync log entries per company. The `SyncLogEntry` interface (`docplanner-integration.service.ts:83-93`) defines the shape.
- `reconciliation-widget` component reads `docplanner_reconciliation_audit` and renders per-date DP vs CRM booking count.

### 6.3 What's missing

- A "Sync Health" admin widget that shows: last successful sync per company, age in hours, count of consecutive partial/error runs, top error messages (first 5 unique strings across all companies). Estimated ~200 lines Angular + 1 SQL view.
- An HTTP-level health endpoint (the `health-check` EF exists but only checks basic project reachability — it doesn't validate cron auth paths).
- Alerting. Today, only humans notice.

---

## 7. Skill resolution

**Skill loading** for this exploration:
- `sdd-explore/SKILL.md` — primary skill, loaded by virtue of being the sdd-explore sub-agent.
- `sdd-phase-common.md` — referenced for envelope format, but artifact persistence mode here is `none` (this is a discover-phase report, not an SDD artifact to commit to openspec/engram).
- `supabase` — referenced (loaded) for v2 API key documentation lookup (`https://supabase.com/docs/guides/api/api-keys`). Critical for confirming that `--no-verify-jwt` is required for `sb_secret_*` keys.
- `engram` protocol — observed; one `mem_save` call was made to capture the audit findings under topic `discover/docplanner-sync-v2-audit`.
- `work-unit-commits` — NOT loaded. No commits made (exploration only).
- `judgment-day` — NOT loaded. No code changes proposed.
- `rafter` — NOT loaded. No security-sensitive code touched (read-only audit of auth patterns).

The exploration did not invoke any of the implementation skills (sdd-design, sdd-spec, sdd-tasks, sdd-apply) because the task is pure discovery — the design phase will be triggered next by the orchestrator based on this report.

---

## 8. Ready for design

**Yes** — the territory is mapped. Key facts the design phase needs to internalize:

1. **The auth break is NOT a single bug** — it's 4 storage paths + 1 EF env var + 1 gateway rule all needing to be aligned to the v2 key system.
2. **The gateway only accepts `sb_secret_*` for EFs with `verify_jwt=false`** (per Supabase docs) — `docplanner-sync-cron` and 4 other cron EFs need their deploy flag flipped.
3. **Even with the gateway fix, the in-EF check `token !== SERVICE_ROLE_KEY` requires the EF env var to ALSO hold the new `sb_secret_*`** — currently it likely holds the legacy JWT.
4. **The `[object Object]` errors are a separate, latent bug** that has been silently blocking 7 bookings for 17+ hours. Fixing `String(e)` → `String(e?.message ?? e)` is one line and unblocks diagnosis.
5. **Manual sync ≠ cron sync** in two important ways: room-conflict handling and `dp_service_unmapped` flagging. Decide which is canonical.
6. **`docplanner-reconciliation-cron` works today despite verify_jwt=true** — this is either a gateway quirk that won't last, or the proof that the gateway DOES accept sb_secret_* and only `docplanner-sync-cron` is misconfigured. The design phase should verify by reading gateway logs / Kong stats.

**Hypotheses to validate before designing the fix** (the design phase should run these in parallel):

- H1: The `docplanner-reconciliation-cron` EF env `SUPABASE_SERVICE_ROLE_KEY` was updated to the v2 key, but `docplanner-sync-cron` was not. **Test**: redeploy `docplanner-sync-cron` with `--no-verify-jwt` AND update its env var. If it works, H1 is correct.
- H2: The gateway has a per-EF allowlist (or cache) of valid `sb_secret_*` values. The reconciliation cron is allowlisted, sync is not. **Test**: redeploy `docplanner-sync-cron` with `--no-verify-jwt` only (no env change). If it works, H2 is correct.
- H3: The gateway behavior is NOT consistent across EFs and the only reliable fix is to deploy ALL DocPlanner EFs with `--no-verify-jwt` AND update all cron-side auth storage to send `sb_secret_*` AND update all EF env vars to `sb_secret_*`. **Test**: apply H1+H2 fixes and see if all 7 failing crons recover simultaneously.

**Open questions the design phase will have to ask the user:**

- Q1: For the in-EF check, do we want a single-key check (`token === SUPABASE_SERVICE_ROLE_KEY`) or a list-based check (`token in [keys]`) — to support rotation without code redeploy?
- Q2: For the cron storage, should we unify all cron auth into ONE storage path (vault only, kill `app.settings.service_role_key` and `internal.app_config`)? This is a one-time migration but a lot of SQL to touch.
- Q3: For the `[object Object]` errors, do we want a one-line fix in the existing EF, or do we want to introduce a structured error type that captures `code`, `message`, `details`, `hint`?
- Q4: For the room-conflict inconsistency between manual and cron sync — which is correct (drop vs insert-with-null)?
- Q5: For observability — invest in a Sync Health widget now, or defer to v2?

**Files the design phase will need to touch** (for reference, NOT as a proposal):

- `supabase/functions/docplanner-sync-cron/index.ts` — auth check, error logging, room conflict, `dp_service_unmapped`
- `supabase/functions/docplanner-reconciliation-cron/index.ts` — error logging
- `supabase/functions/docplanner-api/index.ts` — error logging in retry branch
- `supabase/functions/docplanner-webhook/index.ts` — observability
- `supabase/migrations/` — new migration to flip `verify_jwt=false` for 5+ cron EFs (via dashboard CLI, not SQL); OR migration to centralize cron auth into vault only
- `internal.app_config` table — possibly dropped in favor of vault
- `src/app/features/settings/integrations/integrations.component.ts` — possible Sync Health widget
- `src/app/services/docplanner-integration.service.ts` — possible new endpoints

**What I deliberately did NOT do:**
- Did not propose a code fix.
- Did not write tests.
- Did not change any files.
- Did not save this report as an SDD artifact (mode is `none` — discover-only).
- Did not query the Supabase Management API for the actual EF env values (no tool to read EF secrets directly).
- Did not check the EF cold-start logs for v2-key-related changes (would need historical log analysis).

**Status**: success
**Summary**: Mapped the DocPlanner sync system — 5 Edge Functions, 3 tables, 4 auth storage paths, 12 high/medium bugs, 10 observability gaps, 3 hypotheses about the auth break that the design phase must validate.
**Artifacts**: Engram `discover/docplanner-sync-v2-audit` (1 save). No filesystem artifact.
**Next**: `sdd-design` — design the auth migration + the `[object Object]` fix + the room-conflict unification, with a sync health widget if Q5 is answered yes.
**Risks**:
- R1: The gateway's actual behavior on `sb_secret_*` with `verify_jwt=true` is **not fully understood** without Kong/Envoy access. The design must validate with the platform team or via direct experiment before committing to a specific approach.
- R2: There are 5+ crons beyond DocPlanner (aws-jobs-processor, mail-trash-auto-purge, notify-booking-change, process-recurring-budgets) silently failing because of the same auth break. A DocPlanner-only fix leaves them broken.
- R3: If the `sb_secret_*` value rotates in the future, the multiple storage paths (internal.app_config, vault x2, EF env var x5) must all be updated. Centralizing into one path is critical.
- R4: The 7 broken bookings might be permanently lost if the underlying error is a data violation rather than transient. Manual triage will be needed.
**Skill Resolution**: paths-injected — received the sdd-explore SKILL.md explicitly, loaded supabase for v2 key docs, observed engram protocol for one mem_save call. Other skills (work-unit-commits, judgment-day, rafter, sdd-design) were NOT loaded — this is discover-only.

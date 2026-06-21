# DDoS Resilience & Rate Limiting Audit — Supabase Edge Functions

**Project:** simplifica-crm
**Date:** 2026-06-22
**Scope:** `supabase/functions/*/index.ts` (69 EFs)
**Audit type:** Read-only — no files modified

---

## Executive Summary

| Metric | Count |
|---|---|
| Total Edge Functions (excluding `_shared/`) | 69 |
| EFs using `checkRateLimit` | 32 (46%) |
| EFs WITHOUT rate limiting | 37 (54%) |
| Rate-limited EFs that handle OPTIONS BEFORE rate limit (preflight bypass) | 21 |
| Rate-limited EFs that handle OPTIONS AFTER rate limit (correct) | 3 |
| EFs reading `req.text()` without explicit body-size check | 4 |
| EFs calling external billable APIs (SES, Docplanner, Google, AWS) | 7 |

| Severity | Findings |
|---|---|
| Critical | 1 |
| High | 4 |
| Medium | 6 |
| Low | 4 |
| Info | 3 |

**Verdict:** The shared rate limiter (`_shared/rate-limiter.ts`) is well-engineered (Redis + in-memory fallback, fail-open documented, key prefix guidance, fixed-window with rationale). However, the **deployment pattern** across EFs has a systemic gap: most rate-limited EFs handle CORS preflight BEFORE the rate limit check, enabling a low-cost OPTIONS-flood DoS that bypasses the limiter entirely. Several user-facing EFs have no rate limit at all and rely solely on Supabase gateway JWT verification.

---

## Section 1 — EF Enumeration & Rate Limit Status

### 32 EFs WITH rate limiting (`checkRateLimit`)

| EF | Limit | Window | Key type | Pre-RL IP check | OPTIONS order |
|---|---|---|---|---|---|
| `auth-rate-limiter` | 5 | 60s | `auth:login:<ip>` (UA hash fallback) | inline | N/A (no CORS) |
| `budget-receipt-pdf` | 20 | 60s | `budget-receipt-pdf:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `company-email-accounts` | 30 | 60s | `company-email-accounts:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `company-email-settings` | 30 | 60s | `company-email-settings:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `confirm-budget-cash-payment` | 20 | 60s | `confirm-budget-cash-payment:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `create-booking-payment-link` | 10 | 60s | `create-booking-payment-link:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `create-budget-payment-link` | 10 | 60s | `create-budget-payment-link:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `create-invited-user` | 10 | 60s | `create-invited:<ip>` | yes (helper) | OPTIONS order varies |
| `create-payment-link` | 10 | 60s | `create-payment-link:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `create-ticket` | 20 | 60s | `create-ticket:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `docplanner-api` (general) | 100 | 60s | `docplanner-api:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `docplanner-api` (creds) | **5** | 60s | `docplanner-cred:<ip>` | yes (helper) | inner — after main RL |
| `feedback` | 5 | 60s | `feedback:<ip>` | **inline (x-forwarded-for, NOT helper)** | CORS handled separately |
| `hide-stage` | 20 | 60s | `hide-stage:<ip>` | yes (helper) | OPTIONS AFTER RL ✓ |
| `import-customers` | 5 | 60s | `import-customers:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `import-services` | 5 | 60s | `import-services:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `invoices-email` | 10 | 60s | `invoices-email:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `invoices-pdf` | 20 | 60s | `invoices-pdf:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `issue-invoice` | 30 | 60s | `issue-invoice:<ip>` | yes (helper) | OPTIONS AFTER RL ✓ |
| `payment-webhook-budget` | 120 | 60s | `payment-webhook-budget:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `portal-public` | 30 | 60s | **`booking:<ip>` (NOT function-prefixed)** | yes (helper) | **OPTIONS BEFORE RL** |
| `public-budget-payment-info` | 60 | 60s | `public-budget-payment-info:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `public-budget-payment-redirect` | 30 | 60s | `public-budget-payment-redirect:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `quotes-email` | 10 | 60s | `quotes-email:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `quotes-pdf` | 20 | 60s | `quotes-pdf:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `quotes-recurring-dispatcher` | 5 | 60s | `quotes-recurring-dispatcher:<ip>` | yes (helper) | OPTIONS BEFORE RL |
| `quotes-stats` | 30 | 60s | `quotes-stats:<ip>` | yes (helper) | OPTIONS AFTER RL ✓ |
| `send-branded-email` (user) | 20 | 60s | `send-branded-email:<ip>` | yes (helper) | OPTIONS AFTER RL ✓ |
| `send-branded-email` (internal) | **2** | 60s | `send-branded-email:<ip>` (same key!) | yes (helper) | inner |
| `send-company-invite` | 5 | 60s | `send-company-invite:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `update-company-filter-visibility` | 20 | 60s | `update-filter-vis:<ip>` | yes (helper) | OPTIONS AFTER RL ✓ |
| `upload-verifactu-cert` | 10 | 60s | `upload-verifactu-cert:<ip>` | yes (helper) | **OPTIONS BEFORE RL** |
| `upsert-client` | 100 | 60s | `upsert-client:<ip>` | yes (helper) | OPTIONS AFTER RL ✓ |
| `verifactu-dispatcher` | 10 | 60s | `verifactu-dispatcher:<clientIP>` | yes (helper) | **OPTIONS BEFORE RL** |

### 37 EFs WITHOUT rate limiting

Grouped by exposure surface:

#### A. Internal / cron / DB-trigger (low DoS exposure, but billable)
- `aws-jobs-processor` — AWS SDK calls; only called by `supabase/cron`
- `booking-notifier` — SES email; DB-webhook triggered
- `check-completed-sessions` — DB scan
- `check-gdpr-deadlines` — DB scan
- `data-retention-policy` — DB scan
- `docplanner-reconciliation-cron` — Docplanner API + DB
- `docplanner-sync-cron` — Docplanner API + DB
- `generate-recurring-budgets` — DB heavy
- `import-doctoralia-bookings` — DB inserts; auth via JWT
- `mail-trash-auto-purge` — DB only
- `notify-booking-change` — SES email; pg_net triggered
- `notify-breach-aepd` — service-role only (good)
- `notify-inactive-clients` — calls send-branded-email (amplifies DoS)
- `quotes-recurring-dispatcher` — calls send-branded-email
- `send-budget-notification` — DB trigger
- `send-budget-reminders` — pg_cron
- `verifactu-dispatcher` — DB trigger

#### B. Webhooks (signature-protected — DoS risk limited)
- `docplanner-webhook` — HMAC signature verified
- `payment-webhook-budget` — Stripe + PayPal signature verified

#### C. User-facing (protected by `verify_jwt = true` at gateway, no app-level RL)
- `create-locality` — DB write
- `custom-access-token` — JWT hook (fail-closed validator)
- `delete-stage-safe` — DB delete
- `get-company-filter-visibility` — DB read
- `get-config-stages` — DB read
- `get-config-units` — DB read
- `get-effective-modules` — DB read
- `health-check` — superadmin only (good comment in file)
- `hide-unit` — DB write
- `link-ticket-device` — DB write
- `list-company-devices` — DB read
- `mail-folders` — DB read/write (potentially heavy)
- `reorder-stages` — DB write
- `request-email-account` — DB + AWS SES
- `send-client-consent-invite` — calls send-branded-email (amplifies)
- `send-waitlist-email` — SES
- `update-company-filter-visibility` — DB write *(HAS rate limit — see table above; this EF was in wrong group, listed for completeness)*

#### D. verify_jwt=false, internal-only (medium DoS exposure)
- `aws-iam-provision` — service-role only
- `google-workspace-provision` — service-role only
- `send-push-notification` — service-role only (config.toml line 159: `verify_jwt = false`)
- `ses-domain-verification` — service-role + JWT
- `ses-inbound-provision` — service-role + JWT

---

## Section 2 — Findings by Severity

### CRITICAL

#### F-01: CORS preflight bypasses rate limit on most rate-limited EFs
**Severity:** Critical
**Affected:** 21 of 32 rate-limited EFs (66%)
**Files:** `budget-receipt-pdf`, `company-email-accounts`, `company-email-settings`, `confirm-budget-cash-payment`, `create-booking-payment-link`, `create-budget-payment-link`, `create-payment-link`, `create-ticket`, `docplanner-api`, `import-customers`, `import-services`, `invoices-email`, `invoices-pdf`, `payment-webhook-budget`, `portal-public`, `public-budget-payment-info`, `public-budget-payment-redirect`, `quotes-email`, `quotes-pdf`, `quotes-recurring-dispatcher`, `send-company-invite`, `upload-verifactu-cert`, `verifactu-dispatcher`

**Pattern (budget-receipt-pdf, line 354 vs 363):**
```ts
if (req.method === 'OPTIONS') return new Response('ok', { headers });  // ← returns 200, no RL
const rl = await checkRateLimit(`budget-receipt-pdf:${ip}`, 20, 60000); // ← never reached for OPTIONS
```

**Exploitation scenario:**
1. Attacker sends 1000 OPTIONS requests/sec to `budget-receipt-pdf` with random `Origin` headers.
2. Each request: (a) allocates a Deno isolate or reuses a warm one, (b) builds the CORS headers object, (c) returns 200 with `Access-Control-Allow-*` headers.
3. The 20/min RL budget is never consumed because OPTIONS short-circuits before RL.
4. Under sustained load: cold-start pool exhaustion → other invocations of the same function get `BOOT_ERROR` or latency spikes. If attacker targets multiple EFs, the **function invocation concurrency limit (default 100 on Pro)** is exhausted project-wide.

**Recommended fix:** Move the `checkRateLimit` call to the very top of the handler, BEFORE the OPTIONS branch. Use a dedicated RL key like `cors:<function>:<ip>` for OPTIONS requests, OR include OPTIONS in the same counter as POST. Pattern:
```ts
serve(async (req) => {
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`<function>:${ip}`, 20, 60000);
  if (!rl.allowed) return new Response('429', { headers: rateLimitHeaders(rl) });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  // ... rest
});
```
For OPTIONS-heavy targets, set a SEPARATE stricter cap (e.g., `cors:<function>:<ip>` at 60/min) because preflight is supposed to be cached client-side.

---

### HIGH

#### F-02: User-facing EFs without rate limit can be DoS'd at scale
**Severity:** High
**Affected:** 14 user-facing EFs (`create-locality`, `custom-access-token`, `delete-stage-safe`, `get-company-filter-visibility`, `get-config-stages`, `get-config-units`, `get-effective-modules`, `hide-unit`, `link-ticket-device`, `list-company-devices`, `mail-folders`, `reorder-stages`, `request-email-account`, `send-client-consent-invite`, `send-waitlist-email`)

**Exploitation scenario:**
- All these EFs have `verify_jwt = true` in `config.toml` (gateway enforces JWT signature). That means an attacker MUST hold a valid token to hit them.
- BUT: an attacker who controls a low-privilege authenticated user can issue thousands of DB-heavy requests per minute. The Supabase gateway will accept the JWT; the DB queries inside the EF run with the user's RLS context; the EF has no app-level throttle.
- Example: `mail-folders` calls `createDefaultEngine` + `buildEmailFeatures` + a SECURITY DEFINER RPC. A single user can flood this EF and saturate the project's 100-connection DB pool.
- `send-client-consent-invite` / `send-waitlist-email` chain into `send-branded-email` (which IS rate-limited at 20/min user-side), but **before reaching send-branded-email, the unprotected EF allocates its own isolate and runs its full DB read first**.

**Recommended fix:** Add `checkRateLimit` with at minimum 30 req/min/IP and 10 req/min/user-id to every user-facing EF that does DB writes or external API calls. For pure read EFs (`get-config-stages`, `get-effective-modules`), 60 req/min/IP is acceptable. The shared helper already supports both patterns; the boilerplate is ~6 lines.

---

#### F-03: `feedback` EF — screenshot base64 size is unbounded → memory + cost DoS
**Severity:** High
**File:** `supabase/functions/feedback/index.ts:122-220`

**Pattern:**
```ts
const rl = await checkRateLimit(`feedback:${ip}`, 5, 60000);
// ... auth check ...
payload = await req.json();              // line 197 — no size guard
const { type, description, screenshot, location } = payload;  // screenshot = data:image/png;base64,...
// description length capped at 2000, but screenshot has NO cap
dataURLToUint8Array(screenshot);  // line 197 region — full atob() of base64
// → send through SES (billable per email)
```

**Exploitation scenario:**
1. Authenticated attacker POSTs a feedback payload with `screenshot` = 5 MB data URL of base64-encoded random bytes (~6.7 MB base64).
2. The function: (a) parses JSON, (b) calls `atob()` allocating 5 MB Uint8Array, (c) uploads to Supabase Storage (bucket policy permitting), (d) sends an SES email with the image inline. Step (c) and (d) are billable.
3. Rate limit is 5/min/IP. From a botnet of 1000 IPs, that's 5000 emails × ~$0.0001 SES cost + 25 GB of storage writes per minute.
4. Even at the 5/min cap, each request can carry ~5 MB before failing.

**Recommended fix:**
```ts
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB hard cap
const cl = req.headers.get('content-length');
if (cl && parseInt(cl, 10) > MAX_PAYLOAD_BYTES) return 413;
// also: validate screenshot is data:image/(png|jpeg|webp);base64,<cap to 500 KB>
if (screenshot && screenshot.length > 700_000) return 400;
```
Apply the same `Content-Length` guard to every EF that calls `await req.json()` or `await req.text()`. The Supabase gateway has a 6 MB hard limit, but allowing 6 MB into every EF instance is itself a DoS vector.

---

#### F-04: Body-size DoS in EFs that read raw body
**Severity:** High
**Files:** `docplanner-webhook/index.ts:527`, `payment-webhook-budget/index.ts:178`, `verifactu-dispatcher/index.ts:557`, `auth-rate-limiter/index.ts:73`

**Pattern:** `await req.text()` with no preceding Content-Length check. Each EF will buffer the entire body into memory before signature verification.

**Exploitation scenario:**
- Attacker sends valid-looking Stripe/PayPal webhook headers with a 6 MB body. The function buffers 6 MB into memory, then signature verification fails → 401.
- Repeat 100x/sec from one IP. `payment-webhook-budget` rate limit is 120/min, but each rejected request still costs 6 MB allocation + signature verify CPU.
- Cloudflare in front will likely block the SYN flood, but a slow-loris style attacker who maintains partial connections can exhaust function isolate memory.

**Recommended fix:** Add a Content-Length check before `await req.text()`:
```ts
const cl = parseInt(req.headers.get('content-length') || '0', 10);
if (cl > 1_048_576) return new Response('Payload too large', { status: 413 }); // 1 MB cap
const rawBody = await req.text();
```

---

#### F-05: `portal-public` uses non-prefixed RL key → potential collision
**Severity:** High
**File:** `supabase/functions/portal-public/index.ts:133`
```ts
const rateLimit = await checkRateLimit(`booking:${ip}`, 30, 60000);
```

**Issue:** The shared rate-limiter doc explicitly warns:
> "Without the prefix, two different functions using the same IP as key would share a counter and interfere with each other's limits."

The key is `booking:${ip}` rather than `portal-public:booking:${ip}`. Today this doesn't collide because no other EF uses the `booking:` prefix — but it's a footgun for future EFs (e.g., `create-booking-payment-link` could collide if anyone refactors its key).

**Recommended fix:** Rename key to `portal-public:${ip}` or `portal-public:booking:${ip}` to match the established convention.

---

### MEDIUM

#### F-06: `feedback` does NOT use the shared `getClientIP()` helper → spoofable
**Severity:** Medium
**File:** `supabase/functions/feedback/index.ts:126-129`
```ts
const ip =
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  Deno.env.get('DENO_DEPLOYMENT_ID') ||
  'unknown';
```

**Issue:** The shared `getClientIP()` (in `_shared/security.ts:36`) prefers `CF-Connecting-IP` (Cloudflare-set, cannot be spoofed). `feedback` reads only `x-forwarded-for` first, which is **client-controllable** in some proxy chains. The Supabase gateway may overwrite `x-forwarded-for`, but only with the Cloudflare-provided client IP. If the gateway is bypassed (e.g., via a misconfigured redirect or direct Deno deploy), the spoofing works.

Also, falling back to `DENO_DEPLOYMENT_ID` means **every request to that deployment shares a single rate-limit bucket** — a DoS amplifier: one attacker can exhaust the limit for ALL users of that deployment.

**Recommended fix:**
```ts
import { getClientIP } from '../_shared/security.ts';
const ip = getClientIP(req);
if (ip === 'unknown') return new Response('Cannot determine IP', { status: 400 });
```

---

#### F-07: `auth-rate-limiter` User-Agent fallback hash has low entropy
**Severity:** Medium
**File:** `supabase/functions/auth-rate-limiter/index.ts:39-41`
```ts
const ipKey = clientIp !== 'unknown'
  ? clientIp
  : `ua:${userAgent.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)}`;
```

**Issue:** When neither `CF-Connecting-IP` nor `x-forwarded-for` is present (rare but possible during Supabase gateway failures), the fallback keys all requests with the same User-Agent into one bucket. The hash is a 32-bit DJB-style polynomial — high collision rate at scale. An attacker using a fixed UA can lock out a real user with that UA from the same proxy.

**Recommended fix:** Use a full SHA-256 of the UA:
```ts
const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userAgent));
const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
const ipKey = `ua:${hash}`;
```

---

#### F-08: `send-branded-email` internal-call limit (2/min) shares key with user-call limit (20/min)
**Severity:** Medium
**File:** `supabase/functions/send-branded-email/index.ts:1033`
```ts
const rl = await checkRateLimit(`send-branded-email:${clientIP}`, rlLimit, rlWindow);
```

**Issue:** The key is identical for both branches (`send-branded-email:${ip}`). Only the LIMIT changes between user (20) and internal (2). This means an attacker can:
1. Burn the 2/min internal budget by claiming `X-Internal-Call: true` with a valid JWT.
2. Then switch to user-side and use the 20/min budget.

Actually re-reading: `rlLimit = isInternalCall ? 2 : 20` and the check is a single call with the chosen limit. So the **same Redis key** tracks both, but the cap is per-request. A user calling 20 requests/min and an internal caller using 2 requests/min on the same IP share a counter: if user sends 18 requests first, the internal caller can only do 2 more before hitting 20. This breaks the strict isolation between user traffic and internal traffic.

**Recommended fix:** Use different keys:
```ts
const keyPrefix = isInternalCall ? 'send-branded-email-internal' : 'send-branded-email';
const rl = await checkRateLimit(`${keyPrefix}:${clientIP}`, rlLimit, rlWindow);
```

---

#### F-09: `payment-webhook-budget` rate limit (120/min) is too high for signature-failure path
**Severity:** Medium
**File:** `supabase/functions/payment-webhook-budget/index.ts:166`
```ts
const rl = await checkRateLimit(`payment-webhook-budget:${ip}`, 120, 60000);
```

**Issue:** Stripe sends maybe 5-10 webhooks/min for an active business. 120/min gives 12x headroom. The bigger issue: signature verification happens AFTER the rate-limit counter increments. An attacker sending forged webhooks from a spoofed IP (where they can't spoof the actual Stripe IPs) still consumes 120 of the bucket per minute doing CPU-intensive HMAC verification.

**Recommended fix:** Move signature verification BEFORE the rate-limit check, OR keep a separate tight counter for failed-signature attempts:
```ts
const sigRl = await checkRateLimit(`webhook-sigfail:${ip}`, 5, 60000);
if (!sigRl.allowed) return 429;
// ... verify signature ...
if (!signatureValid) { /* already counted in sigRl */ return 401; }
const rl = await checkRateLimit(`payment-webhook-budget:${ip}`, 120, 60000);
```

---

#### F-10: Webhook EFs without IP-based rate limit on signature failure
**Severity:** Medium
**Files:** `docplanner-webhook`, `payment-webhook-budget`

**Issue:** Both EFs verify HMAC signatures, which means random attackers are rejected. BUT: signature verification is CPU-expensive (HMAC-SHA256 over the full body). An attacker with a stolen-but-revoked Docplanner secret can keep sending signed webhooks that fail downstream business validation (e.g., unknown `integration_id`). Each request consumes a full body parse, AES-GCM decrypt (for `oauthDecrypt`), and DB lookup.

**Recommended fix:** Add a counter that ticks up on `status >= 400` responses, not just on rate-limit-block responses. Or add a separate 10/min cap on the `dbLookup` step inside the webhook handler.

---

#### F-11: `request-email-account` has no rate limit and calls AWS SES directly
**Severity:** Medium
**File:** `supabase/functions/request-email-account/index.ts`

**Issue:** JWT-protected but no rate limit. Calls AWS SES directly (not via `send-branded-email`). One authenticated user can flood SES — each request provisions an SES identity and can trigger domain verification DNS calls.

**Recommended fix:** Add `checkRateLimit('request-email-account:${userId}', 5, 3600000)` — 5 per hour per user is generous.

---

### LOW

#### F-12: `custom-access-token` hook runs on every login with no rate limit
**Severity:** Low
**File:** `supabase/functions/custom-access-token/index.ts`

**Issue:** This is a JWT hook called by Supabase Auth on every token issuance. Rate limiting here would interfere with Supabase's own backoff. The fail-closed `validateJWTHook` already mitigates malformed tokens. Leaving it unprotected is acceptable.

**Recommended fix:** No change — but ensure the `auth-rate-limiter` (F-05 above) is the choke point, and that the hook itself can't be bypassed.

---

#### F-13: `health-check` runs DB + auth gateway + EF latency probes — no rate limit
**Severity:** Low
**File:** `supabase/functions/health-check/index.ts`

**Issue:** Superadmin-only endpoint polled every 30s. Probes the database with `SELECT 1` via service_role, PostgREST, and `/auth/v1/health`. A superadmin account compromise would let an attacker issue one probe per 30s × N companies = sustained load on the auth gateway.

**Recommended fix:** Add a 10/min/IP cap to be safe; the dashboard should batch.

---

#### F-14: `mail-folders` does complex classification work without rate limit
**Severity:** Low
**File:** `supabase/functions/mail-folders/index.ts`

**Issue:** Imports `classification-engine.ts` (`createDefaultEngine`, `buildEmailFeatures`) which is non-trivial. JWT-protected. User can call many times per minute.

**Recommended fix:** Add `checkRateLimit('mail-folders:${userId}', 30, 60000)`.

---

#### F-15: `send-push-notification` is `verify_jwt = false` and uses service-role
**Severity:** Low
**File:** `supabase/functions/send-push-notification/index.ts`, `config.toml:159`

**Issue:** Anyone with the service-role key (which lives in env vars of every other EF and the pg_net triggers) can send push notifications to any subscribed user. If service-role key leaks via any other EF log/exception, push spam is possible.

**Recommended fix:** Validate a shared HMAC secret header (`X-Internal-Signature`) on every call. Not strictly a rate-limit issue, but it's the same trust-boundary problem.

---

### INFO

#### F-16: Supabase platform limits (per docs, Pro plan)
- Edge Function invocations: **2M/month** on Pro, 500K on Free
- Concurrent executions: **100** per project on Pro
- Body size limit: **6 MB** per request
- Cold start: ~250-400ms typical

**Implication:** At 100 concurrent executions project-wide, even a 30 req/min rate limit per EF per IP doesn't prevent a botnet of 100 IPs × 30 req/min = 3000 req/min on a single EF, which would saturate the project concurrency budget and cause cold-start contention for **every other EF**.

**Mitigation:** Cloudflare in front handles volumetric DDoS. The per-EF rate limit is only defense-in-depth against targeted application-level abuse.

---

#### F-17: `_shared/cors.ts` and `_shared/security.ts` are well-designed
The `getClientIP()` helper correctly prefers CF-Connecting-IP. The `cors.ts` `getCorsHeaders()` validates origin against `ALLOWED_ORIGINS`. Both are reusable and used by most EFs. The few EFs that don't use `getClientIP()` (F-06) should be migrated.

---

#### F-18: `auth-rate-limiter` is the gold standard
The 5/min limit on `/auth/v1/token?grant_type=password`, applied at the gateway (Supabase allows routing auth endpoints to a wrapper EF), is exactly the right pattern. The UA-hash fallback (F-07) is the only weak point.

---

## Section 3 — Bypass Pattern Inventory

| Bypass pattern | EFs affected | Severity |
|---|---|---|
| OPTIONS handled before `checkRateLimit` (preflight flood) | 21 EFs | Critical |
| `checkRateLimit` result ignored / not returned as 429 | 0 EFs (all 32 enforce) | None |
| Body read before `checkRateLimit` (timing DoS) | 0 EFs (rate limit runs first in all 32) | None |
| Weak key (uses `req.url` or `Date.now()`) | 0 EFs (all use `<func>:${ip}`) | None |
| Key collision across functions | 1 EF (`portal-public` uses `booking:` prefix) | High |
| `getClientIP()` not used → spoofable IP | 1 EF (`feedback`) | Medium |
| No body-size guard before `req.text()` / `req.json()` | 4 EFs | High |

---

## Section 4 — CORS Preflight DoS Detail

The 21 EFs that handle OPTIONS before rate limit, in order of exploitability:

1. **High-volume public-facing EFs** (each call hits Stripe/PayPal/SES):
   - `confirm-budget-cash-payment` (20/min cap would never engage for OPTIONS)
   - `create-booking-payment-link`, `create-budget-payment-link`, `create-payment-link`
   - `public-budget-payment-info` (60/min — high cap means even bigger flood if attacker actually reaches RL via POST)
   - `public-budget-payment-redirect`
   - `payment-webhook-budget` (120/min)

2. **High-cost EFs (Docplanner, AWS, external APIs)**:
   - `docplanner-api` (100/min — generous; OPTIONS not counted)
   - `upload-verifactu-cert`
   - `verifactu-dispatcher`

3. **Bulk-write EFs (CSV imports, customer imports)**:
   - `import-customers` (5/min — very strict, but OPTIONS not counted)
   - `import-services` (5/min)

4. **PDF/email rendering**:
   - `budget-receipt-pdf`, `invoices-pdf`, `quotes-pdf` (20/min each)
   - `invoices-email`, `quotes-email` (10/min each)

5. **Tenant-config EFs**:
   - `company-email-accounts`, `company-email-settings` (30/min each)
   - `create-ticket` (20/min)
   - `send-company-invite` (5/min — very strict, OPTIONS bypass still useful to attacker)

6. **Portal + cron-style dispatcher**:
   - `portal-public` (30/min)
   - `quotes-recurring-dispatcher` (5/min)

**Recommended fix (applies to all):** Move `checkRateLimit` to the top, BEFORE the OPTIONS branch. Example refactor for `budget-receipt-pdf`:
```ts
serve(async (req) => {
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`budget-receipt-pdf:${ip}`, 20, 60000);
  if (!rl.allowed) return new Response('429', { status: 429, headers: getRateLimitHeaders(rl) });

  // THEN CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ... rest of handler
});
```

---

## Section 5 — Memory Exhaustion Vectors

| EF | Body read | Implied limit | Actual limit | Risk |
|---|---|---|---|---|
| `feedback` | `req.json()` (line 197) | Supabase 6 MB gateway cap | None inside EF | High — `screenshot` base64 unbounded |
| `docplanner-webhook` | `req.text()` (line 527) | Supabase 6 MB | None inside EF | Medium — signed, but signature verify on 6 MB is CPU |
| `payment-webhook-budget` | `req.text()` (line 178) | Supabase 6 MB | None inside EF | Medium — same |
| `verifactu-dispatcher` | `req.text()` (line 557) | Supabase 6 MB | None inside EF | Low — internal DB trigger only |
| `auth-rate-limiter` | `req.text()` (line 73) | Supabase 6 MB | None inside EF | Low — proxied to Supabase auth |
| `upload-verifactu-cert` | `req.json()` (line 125) | Supabase 6 MB | None inside EF | Medium — cert upload |
| `import-customers` | `req.json()` (line 181) | Supabase 6 MB | None inside EF | Medium — large CSV import |
| `import-services` | `req.json()` (line 169) | Supabase 6 MB | None inside EF | Medium — large CSV import |

**Global recommendation:** Add a Content-Length guard at the top of every EF that calls `req.text()`, `req.json()`, `req.formData()`, or `req.arrayBuffer()`. Even a 2 MB cap would prevent the worst-case memory exhaustion while being 3x the legitimate payload size.

---

## Top 5 Most Exploitable EFs

### 1. **`feedback`** — screenshot base64 DoS + SES cost amplification
- **Vector:** Authenticated user POSTs large base64 screenshot → atob() allocates MBs → SES sends email with inline image → costs money per request.
- **Mitigation already in place:** 5/min/IP rate limit, JWT required.
- **Gap:** Screenshot size uncapped; `getClientIP()` helper not used; spammable by authenticated attackers (no per-user cap).
- **Fix:** Cap screenshot base64 at 500 KB, switch to `getClientIP()`, add per-user-id rate limit, add Content-Length pre-check.

### 2. **CORS preflight flood (any of the 21 EFs in F-01)** — easiest DoS in the system
- **Vector:** Millions of OPTIONS requests/sec from a botnet. Each request runs the EF in a warm isolate, builds the CORS response, returns 200. No rate limit consumed.
- **Mitigation already in place:** None at the EF level.
- **Gap:** 21 of 32 rate-limited EFs handle OPTIONS before rate limit.
- **Fix:** Move `checkRateLimit` to the top of every handler, before the OPTIONS branch. Add a separate stricter OPTIONS cap (e.g., 60/min) if you want to be extra-safe.

### 3. **`send-branded-email`** — internal-call rate limit shared with user call
- **Vector:** Attacker abuses the 20/min user cap by claiming `X-Internal-Call: true`, which switches to the 2/min internal cap. Same Redis key — both share the counter. Compromised internal EF or attacker with JWT can exhaust the budget, blocking ALL outbound emails (booking confirmations, budgets, invoices, breach notifications).
- **Mitigation already in place:** 20/min user, 2/min internal.
- **Gap:** Same Redis key for both modes.
- **Fix:** Use distinct keys (`send-branded-email-internal:${ip}` vs `send-branded-email:${ip}`).

### 4. **`portal-public`** — non-prefixed RL key + 30/min high cap + OPTIONS bypass
- **Vector:** All booking-related traffic from the public portal hits this single EF. The 30/min cap is generous for legitimate use but the key `booking:${ip}` is vulnerable to future collision (e.g., when someone adds another EF and reuses `booking:`). OPTIONS preflight bypassed.
- **Mitigation already in place:** 30/min/IP.
- **Gap:** Key not function-prefixed (F-05); OPTIONS bypassed (F-01).
- **Fix:** Rename key to `portal-public:${ip}`, move rate limit above OPTIONS branch.

### 5. **Unprotected user-facing EFs (`mail-folders`, `link-ticket-device`, `list-company-devices`, `create-locality`, `delete-stage-safe`, `hide-unit`, `reorder-stages`)** — DB query flooding
- **Vector:** Authenticated low-privilege user issues 1000+ requests/min. JWT validates, EF runs DB query, RLS enforces row visibility, but DB connection pool (100 max) is exhausted project-wide. Affects EVERY other user across the project.
- **Mitigation already in place:** `verify_jwt = true` at gateway.
- **Gap:** No app-level throttle.
- **Fix:** Add `checkRateLimit('<func>:${userId}', 30, 60000)` to each. 6 lines of boilerplate per EF.

---

## Appendix A — Files Audited

```
supabase/functions/_shared/rate-limiter.ts (295 lines)        — shared module
supabase/functions/_shared/security.ts (122 lines)            — getClientIP helper
supabase/functions/auth-rate-limiter/index.ts (87 lines)      — gateway auth throttle
supabase/functions/feedback/index.ts (390 lines)              — high-risk user EF
supabase/functions/send-branded-email/index.ts (1033+ lines)  — internal email hub
supabase/functions/payment-webhook-budget/index.ts            — webhook with body read
supabase/functions/docplanner-webhook/index.ts                — webhook with body read
supabase/functions/verifactu-dispatcher/index.ts              — DB trigger, body read
supabase/config.toml (223 lines)                              — function-level JWT config
supabase/functions/_shared/cors.ts                            — shared CORS helper
```

All 69 `supabase/functions/*/index.ts` files were enumerated via `grep -l checkRateLimit`.

---

## Appendix B — Verification Commands

```bash
# List all EFs WITHOUT rate limiting
comm -23 <(ls -d supabase/functions/*/ | grep -v _shared | sort) \
         <(grep -l "checkRateLimit" supabase/functions/*/index.ts | xargs -I{} dirname {} | sort -u | sed 's|$|/|')

# Find EFs that read body without size guard
grep -lE "await req\.(text|json|formData|arrayBuffer)\(\)" supabase/functions/*/index.ts | \
  xargs -I{} sh -c 'grep -L "content-length" "{}"' 2>/dev/null

# Verify all rate-limited EFs return 429
for f in $(grep -rl "checkRateLimit" supabase/functions/*/index.ts); do
  if ! grep -qE "rl\.allowed|rateLimit\.allowed|rateLimitResult\.allowed" "$f"; then
    echo "MISSING 429 ENFORCEMENT: $f"
  fi
done
# (output: empty — all 32 EFs properly enforce)
```

---

## Appendix C — Recommended Remediation Order

1. **(Week 1)** Move `checkRateLimit` to top of handlers in the 21 affected EFs (F-01). This is the single highest-impact change.
2. **(Week 1)** Fix `feedback` screenshot size, switch to `getClientIP()`, add Content-Length guard (F-03, F-06).
3. **(Week 2)** Add `checkRateLimit` to the 14 unprotected user-facing EFs (F-02).
4. **(Week 2)** Add Content-Length guards to the 4 EFs that read raw body (F-04).
5. **(Week 3)** Rename `portal-public` key, separate `send-branded-email` internal/user keys (F-05, F-08).
6. **(Week 3)** Add signature-failure rate limit to webhooks (F-09, F-10).
7. **(Ongoing)** Audit each new EF at PR time: must use `getClientIP()` helper, must call `checkRateLimit` before any body read, must handle OPTIONS AFTER rate limit.
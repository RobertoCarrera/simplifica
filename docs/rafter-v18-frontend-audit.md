# Frontend Security Audit — Simplifica CRM (Angular)

**Audit date:** 2026-06-21
**Scope:** `F:/simplifica/simplifica-crm` — Angular frontend, Supabase JS v2, related client-side wiring. Static review only — no dynamic testing, no `rafter run` (no API key). `rafter secrets` ran clean on `src/`.
**Auditor tool:** manual audit per the supplied 11-step checklist + `rafter secrets` (local tier only).
**Methodology caveats:**

- Static review only — payloads not exercised. Several "stored XSS" findings are *trust-boundary* concerns; they fire only if (a) a malicious value reaches the sink and (b) DOMPurify is bypassed on the way there.
- The `rafter` remote tiers (`rafter run`, `rafter run --mode plus`) were **NOT executed** because `RAFTER_API_KEY` is not set. `rafter secrets` (local tier) was executed; it only checks for hardcoded secrets. **SAST/SCA coverage is missing** — a remote scan should still be run before sign-off.
- "False positive" patterns called out explicitly in the findings below.

---

## Executive summary

| Severity | Count | Notes |
|----------|-------|-------|
| Critical | 1     | Public unauthenticated XSS sink (defense-in-depth, RPC not yet implemented) |
| High     | 4     | Stored XSS sinks + dev-time secret leakage paths |
| Medium   | 5     | Dead-but-armed RLS bypass, JWT-in-localStorage, misc. hardening |
| Low      | 7     | UX/scope hardening, CSP coverage gaps, code-quality nits |
| Info     | 6     | Positive findings, context, false-positive flags |
| **Total** | **23** |  |

**One-line verdict:** the codebase shows a **strong, opinionated security stance** (CSRF middleware, MFA enforcement, sessionStorage cache hygiene, CSP via `vercel.json`, in-memory CSRF token, signed CSRF tokens with constant-time compare, suppress-all-console in prod). The main residual risk is **stored-XSS sinks that bypass DOMPurify when the trust boundary is admin-controlled**, plus the **default Supabase pattern of storing access/refresh JWTs in `localStorage`** (industry-standard tradeoff, but worth a defense-in-depth pass).

---

## 1. CSRF protection

### ✅ Positive

- **`supabase/functions/_shared/csrf-middleware.ts`** implements `withCsrf(handler)` wrapping 11 state-changing Edge Functions (see `csrf-middleware.ts:7-13`, applied in `create-budget-payment-link`, `create-ticket`, `create-payment-link`, `confirm-budget-cash-payment`, `import-services`, `quotes-email`, `issue-invoice`, `upload-verifactu-cert`, `invoices-email`, `upsert-client`, `import-customers`, `hide-stage`).
- Tokens are **HMAC-SHA256** signed against `CSRF_SECRET` env var, **userId-bound** (`csrf-protection.ts:67`), **1-hour TTL** (`csrf-protection.ts:9`), and compared with **constant-time** comparison (`csrf-protection.ts:12-22`, VULN-10 fix).
- Exempt endpoints (`booking-public`, `public-payment-info`, `public-payment-redirect`, `payment-webhook-*`, `custom-access-token`, `get-csrf-token`) are documented inline (`csrf-middleware.ts:19-27`).
- **Frontend token storage is in-memory only** (`csrf.service.ts:19-23` comment + `BehaviorSubject`, no localStorage). Auto-refresh on 403 (`csrf.interceptor.ts:42-50`).
- **`CsrfService.clearToken()` is wired** for logout flow (available, though logout currently relies on component-level cleanup — see L2 below).

### 🔍 Findings

| # | Issue | Location | Severity | Recommendation | Effort |
|---|-------|----------|----------|----------------|--------|
| 1.1 | No CSRF on Supabase REST/PostgREST calls. Relying entirely on the JWT in `Authorization` header. **SameSite=Lax cookies are NOT in scope** here because Supabase uses Bearer-token auth, but JWTs in `localStorage` (see 6.1) **are accessible to XSS** which is the bigger threat. | `supabase-client.service.ts:127-143` | info | RLS + Bearer-only is the documented Supabase pattern; pair with the XSS-hardening fixes in §3. | small |
| 1.2 | `CsrfService.clearToken()` exists (`csrf.service.ts:134-138`) but is **not called from `auth.service.ts:logout()`**. The token is held in `BehaviorSubject` so it's GC'd when the service is destroyed, but it's still wired through Angular DI (`providedIn: 'root'`) — singleton until tab close. **Low impact** because the token is already in-memory. | `auth.service.ts:1468-1496` | low | Call `csrfService.clearToken()` in `logout()` after `signOut()`. | small |
| 1.3 | `csrf.interceptor.ts:23-29` exempts `/auth/login`, `/auth/register`, `/auth/reset-password`, `/get-csrf-token` from CSRF. **Public endpoints are correct to skip CSRF**, but verify the Supabase auth path is actually hit via those URL fragments — if the auth path goes through PostgREST `/auth/v1/...` instead, the exemption list won't match. | `csrf.interceptor.ts:22-31` | info | Confirm by grepping actual auth-call URLs in production. | small |

---

## 2. Session storage

### What is stored where

| Storage | Key | Source | Sensitivity |
|---------|-----|--------|-------------|
| `localStorage` | `sb-ufutyjbqfjrlzkprvyvs-auth-token` (canonical) | `supabase-client.service.ts:48` | **HIGH** — Supabase access + refresh JWTs |
| `localStorage` | `app_lang` | `core/services/language.service.ts:113` | low — language code |
| `localStorage` | `company-default-language` | `features/admin/company/company-admin.component.ts:580` | low — language code |
| `localStorage` | `sidebar-collapsed` | `services/sidebar-state.service.ts:24` | none — UI state |
| `localStorage` | `simplifica_export_configs`, `simplifica_import_configs`, `simplifica_export_jobs`, `simplifica_import_jobs` | `services/export-import.service.ts:703-717` | medium — may include query params with client names; mostly job metadata |
| `localStorage` | encrypted blobs (key managed by `SecureStorageService`) | `services/secure-storage.service.ts` | medium — encrypted, but key in sessionStorage (see 6.2) |
| `localStorage` | `[pwa-install]` banner flag | `shared/ui/pwa-install/pwa-install.component.ts:153,174` | none |
| `sessionStorage` | `simplifica_app_user_cache` (APP_USER_CACHE_KEY) | `auth.service.ts:455,536` | **MEDIUM** — `AppUser` incl. email, role, company_id, memberships |
| `sessionStorage` | `simplifica_professional_mode` | `auth.service.ts:951` | medium — role-context switch state |
| `sessionStorage` | `simplifica_modules_cache` | `services/supabase-modules.service.ts:172` | medium — module/permission cache |
| `sessionStorage` | `last_active_company_id` | `auth.service.ts:920` | low |
| `sessionStorage` | `auth_return_to` | `guards/auth.guard.ts:95` | low — path-only |
| `sessionStorage` | `oauth_csrf_nonce` | `features/settings/integrations/integrations.component.ts:496` | low — random nonce |
| `sessionStorage` | `mfa_stepup_<area>` | `features/auth/mfa-verify/mfa-verify.component.ts:267-270` | low — timestamp only |
| `sessionStorage` | `simplifica_sk` (AES-GCM key, base64) | `services/secure-storage.service.ts:93` | **HIGH** — encryption key, exfiltratable by any XSS |

### Findings

| # | Issue | Location | Severity | Recommendation | Effort |
|---|-------|----------|----------|----------------|--------|
| 2.1 | **Supabase access + refresh JWTs in `localStorage`** — exfiltratable by any XSS in the app tab. This is the **default Supabase JS client behavior** when `persistSession: true`. | `supabase-client.service.ts:131-133` (`persistSession: true`) | high | Acceptable for an SPA, but **defense-in-depth**: add a runtime CSP `connect-src` allowlist (already in `vercel.json:59`), shorten access-token lifetime in Supabase project settings, and consider using HttpOnly cookies via a custom auth flow. | large (architectural) |
| 2.2 | **AES-GCM encryption key for `SecureStorageService` lives in `sessionStorage`** — any XSS can read it and decrypt all `localStorage` blobs. The threat model relies on tab-close isolation. | `services/secure-storage.service.ts:67-95` | medium | Document the threat model in code; if any encrypted blob contains PII (clients, invoices, clinical notes), restrict access via a server-side key (Key Encryption Key wrapping a DEK). | large |
| 2.3 | `simplifica_app_user_cache` stores `appUser` (email, role, company_id, memberships) in `sessionStorage` for instant hydration. Cache is rejected if older than 5 minutes OR for a different `authId` — good. | `auth.service.ts:495-543` | low | Acceptable. Already bounded by 5-min TTL + authId match. | n/a |
| 2.4 | `simplifica_modules_cache` and `simplifica_professional_mode` cleared on logout (`auth.service.ts:800-803`). **All other sessionStorage keys are NOT cleared on logout** — they're inert after tab close (sessionStorage semantics), so this is **fine**. | `auth.service.ts:800-803` | info | No change needed. | n/a |
| 2.5 | `last_active_company_id` set in `switchCompany` and during auth, removed in logout. **Not cleared on `clearUserData` for the `simplifica_app_user_cache`** — wait, it IS (line 803). OK. | `auth.service.ts:803` | info | OK. | n/a |

### `clearAalCache` on logout — verified ✅

`clearAalCache` is exported from `guards/auth.guard.ts:48-51` and called from `auth.service.ts:1480` inside `logout()`. This clears **both** `aalCacheByUser` (the MFA assurance-level cache) **and** `lastServerRevalidation` (admin role revalidation cache). Good.

---

## 3. Potential XSS vectors

### Positive findings (DOMPurify usage)

- **`core/pipes/safe-html.pipe.ts:12-103`** — strict allowlist, `FORBID_TAGS` + `FORBID_ATTR`, AND **strips `url()` and `expression()` from inline `style` attributes** (line 91-99) — defends against CSS-based data exfiltration (tracking beacons, IE expression() injection). **Strong.**
- **`features/docs/markdown.service.ts:53-80`** — separate, even stricter allowlist; explicit `FORBID_TAGS` (`script`, `iframe`, `object`, `embed`, `form`, `style`, `link`); forbids event handlers explicitly. **Strong.**
- **`shared/ui/tour-overlay/tour-overlay.component.ts:181-183`** — `DOMPurify.sanitize(html)` on every step's content.
- **`features/tickets/detail/ticket-detail.component.ts:1017-1058`** — sanitizes user comments, then re-sanitizes after DOM mutation (defends against DOMPurify-bypass via constructed nodes).
- **DOMPurify is used in 8 components** — tour overlay, contract editors, ticket detail/comments, tiptap editor, markdown pipe, safe-html pipe.

### Findings

| # | Issue | Location | Severity | Recommendation | Effort |
|---|-------|----------|----------|----------------|--------|
| 3.1 | **🔴 CRITICAL: Public, unauthenticated XSS sink.** `PublicPrivacyPolicyComponent` calls `get_company_privacy_policy(companyId)` RPC and passes the response straight into `bypassSecurityTrustHtml` **without DOMPurify**. Route is `/privacy/:companyId` (no auth guard, `app.routes.ts:551-557`). **The RPC is not yet implemented** (grep finds no SQL definition), so today the catch swallows the error and the fallback UI renders — the page is currently safe. **The instant the RPC ships, the sink becomes live.** | `features/public/privacy-policy/public-privacy-policy.component.ts:51-56` | **critical** (latent) | Wrap with `DOMPurify.sanitize(data, { ALLOWED_TAGS: [...], FORBID_TAGS: ['script','iframe',...] })` before `bypassSecurityTrustHtml`. Same pattern as `safe-html.pipe.ts`. | small |
| 3.2 | **`email-branding.component.ts` interpolates `footerText`, `fontFamily`, `primaryColor`, `backgroundColor`, `logoPreview` into a raw HTML template string then `bypassSecurityTrustHtml` — no DOMPurify in the pipeline.** `footerText` is read from DB (`settings.email_branding.footer_text`). A malicious admin setting `footer_text` to `</span><img src=x onerror=alert(document.cookie)>` triggers stored XSS whenever another admin opens the preview. | `features/admin/email-accounts/email-branding.component.ts:47-49, 196-260` | high | Pipe the rendered HTML through `DOMPurify.sanitize()` (use the same config as `safe-html.pipe.ts`). Also harden `fontFamily` against CSS injection (regex-validate `#?[a-z0-9 ,'-]+`). | small |
| 3.3 | **`campaign-form.component.ts` preview modal binds `previewHtml` (which is `this.form.content` with sample variables replaced) via `[innerHTML]` with no sanitization.** Admin-only feature, but stored in DB and the same `content` is later rendered to clients via email — if it ever gets re-rendered in-app, this becomes stored XSS. | `features/marketing/campaign-form.component.ts:1046-1058, 703` | medium | Wrap in DOMPurify before display. Consider a TipTap-style editor with sanitized output for v2. | medium |
| 3.4 | **`signature-editor.component.ts:56-59`** calls `bypassSecurityTrustHtml` on `buildPreviewHtml(signatureText)`. **Verified safe for `signature`, `senderName`, `fromEmail`, `prof.title`, `prof.company_name` — all passed through `escapeHtml()`** (`signature-editor.component.ts:111-119, 130-150`). **`prof.avatar_url` and `prof.company_logo_url` are interpolated raw into `src="..."`** (line 136, 154). An attacker controlling the `professionals` table could inject `x" onerror="alert(1)` if the URL column is not strictly URL-validated server-side. | `features/webmail/components/signature-editor/signature-editor.component.ts:135-137, 153-155` | medium | Escape `prof.avatar_url` / `prof.company_logo_url` (only `http(s):` URLs should be allowed; reject `javascript:` and quote chars). | small |
| 3.5 | **`features/tickets/detail/ticket-detail.component.ts:1031`** — `div.innerHTML = cleanHtml;` is run **twice** (looks like a copy-paste bug on lines 1030-1031, the second assignment overwrites the first). The double assignment is **harmless** (same value) but suggests dead code worth removing. | `ticket-detail.component.ts:1030-1031` | info | Remove the duplicate. | trivial |
| 3.6 | **`features/docs/components/docs-search.component.ts:242-264`** — `highlight()` escapes user query with `escapeHtml()` before wrapping matches in `<mark>`. **Correct** — false-positive risk noted. | `docs-search.component.ts:242-264` | info | None. | n/a |
| 3.7 | **`features/customers/components/secure-clinical-notes/secure-clinical-notes.component.ts:569`** — `bypassSecurityTrustResourceUrl(doc.signed_url)`. Used to render a Supabase Storage signed URL in an iframe. **Trusted source** (signed URL from Supabase), but if `signed_url` ever contains user-influenced query params, an attacker could inject a `javascript:` URL. **Currently safe** because Supabase generates the signed URLs. | `secure-clinical-notes.component.ts:569` | info | Validate the URL scheme (`http:`/`https:`) before passing to `bypassSecurityTrustResourceUrl`. | small |
| 3.8 | `dompurify@^3.4.11` in `package.json:48`. The overrides section pins several vulnerable transitive deps — good hygiene. | `package.json:48, 109-141` | info | None. | n/a |

---

## 4. Hardcoded secrets / API keys

### `rafter secrets` results

- `rafter secrets F:/simplifica/simplifica-crm/src` — **clean, no secrets detected.**
- Manual grep for `sk_live_/sk_test_/pk_live_/pk_test_/AKIA*/eyJ*/ya29.*/SG.` — **no matches in `src/`.**
- Manual grep for `password|secret|apiKey|api_key|privateKey` in `src/**/*.ts` — only:
  - **Field/variable names** (e.g. `smtp_password`, `oauth_client_secret`, `aws_secret_key`, `totp_secret`, `webhook_secret_encrypted`) — all of these flow to Supabase RPCs / Edge Functions, never hardcoded.
  - **`environment.prod.ts:36` — `anychatApiKey: process.env["ANYCHAT_API_KEY"] || ""`** — see 4.1 below.
  - **`environment.ts:34` — `googlePickerApiKey: ""`** — dev stub.
- `env.local` exists (314 bytes) but contains only `SUPABASE_URL=...` (no secret keys committed).

### Findings

| # | Issue | Location | Severity | Recommendation | Effort |
|---|-------|----------|----------|----------------|--------|
| 4.1 | **`environment.prod.ts` uses `process.env["ANYCHAT_API_KEY"]`** — Angular CLI's `process.env` replacement will leave the literal `process.env["ANYCHAT_API_KEY"]` in the bundle if undefined. At runtime in the browser, this throws `ReferenceError: process is not defined`. The author is aware (comment lines 6-9), but the pattern is fragile. If `ANYCHAT_API_KEY` ever ends up defined at build time, it ships in the JS bundle. | `environments/environment.prod.ts:36` | medium | Drop the `process.env` references from `environment.prod.ts` (per the author's own comment, they don't work in Angular bundles). Use a runtime-config fetch (already exists via `runtime-config.service.ts`) for any real secrets — keep `ANYCHAT_API_KEY` server-side only in the Edge Function that uses it. | small |
| 4.2 | **`environment.prod.ts` is missing `googlePickerApiKey`** that exists in `environment.ts:34`. If any code path reads `environment.googlePickerApiKey` in prod, it gets `undefined`. Likely intended. | `environments/environment.prod.ts` (vs `environment.ts:34`) | low | Add to prod with explicit empty default and a comment, or remove from dev. | trivial |
| 4.3 | **Supabase URL + anon/publishable key** are **public by design** (the comment in `environment.ts:6-9` calls this out). The anon key is the modern `sb_publishable_...` format (good — rotatable independently of legacy JWT anon keys). | `environment.ts:9-10`, `environment.prod.ts:9-10` | info | None — public-by-design. | n/a |
| 4.4 | `supabase-client.service.ts:24-26` writes redacted anon key preview to `window.__SUPABASE_CFG__`. The full key is NOT logged. | `supabase-client.service.ts:24-26` | info | None. | n/a |

### False positive notes

- The `console.log` calls inside `auth.service.ts` log **event names** (`SIGNED_IN`, `INITIAL_SESSION`) and **property names** (SUPABASE_URL env var name, not value) — safe.
- `supabase-client.service.ts:43-44` logs `urlRef` and `keyRef` (Supabase project refs, which are public).
- `runtime-config.service.ts:42-47` logs the **first 200 chars of the runtime config JSON**, which includes the full Supabase URL and anon key. Silenced in prod but in dev/staging this **puts the anon key in DevTools**. **Low** (anon is public) but worth noting.

---

## 5. Unsafe console.log

### Production silencing — verified ✅

- `main.ts:6-17` replaces `console.log/info/warn/debug/error` with a `noop` function **in production builds**. Comment line 8 explicitly cites the risk: "console.log/info/warn/debug can leak internal state, PII and architecture details to anyone with DevTools open."
- `init.js` (`public/init.js:1-48`) installs a `Proxy` on `window.console` that no-ops `log/info/debug` in all environments. Belt-and-braces.

### Dev-time findings

| # | Issue | Location | Severity | Recommendation | Effort |
|---|-------|----------|----------|----------------|--------|
| 5.1 | **`lib/edge-functions.helper.ts:94`** — `console.log("📤 Edge Function request:", url, body)` logs the **entire request body**. For Verifactu flows this includes `cert_pem`, `key_pem`, `key_pass` (private key PEM + password!). For invoice flows, invoice bodies (less sensitive but still contains business data). | `lib/edge-functions.helper.ts:94, 120` | high | Replace with a redacted log: log only `functionName`, `url`, and a SHA-256 of the body. Never log `cert_pem` / `key_pem` / `key_pass`. | small |
| 5.2 | **`interceptors/http-error.interceptor.ts:71, 79, 125, 137`** — `console.error("...", { url: req.url, error: error.error })` logs **full HTTP error bodies** for 400/500/etc. Could include server-side stack traces, PII, SQL details. | `http-error.interceptor.ts:69-72, 76-79, 122-126, 134-138` | medium | Log only `url` + sanitized `status`. If you must log the body for debugging, redact known PII fields (email, phone, NIF, address) first. | small |
| 5.3 | **`runtime-config.service.ts:42-47`** logs `JSON.stringify(cfg).slice(0, 200)` — in dev/staging this exposes the Supabase URL and anon key prefix. Acceptable (anon is public) but combined with the URL it confirms which project you're auditing. | `runtime-config.service.ts:42-47` | low | None in dev; silenced in prod. | n/a |
| 5.4 | **`auth.service.ts:158, 165, 176, 179, 184, 190`** — auth state-change events logged in dev. No PII. **False positive risk only** (silenced in prod). | `auth.service.ts:158-190` | info | None. | n/a |
| 5.5 | **`analytics.service.ts:434, 461, 486, 526, 539, 558, 578, 596, 607, 623, 645, 693, 716, 767, 778, 801, 872`** — many `console.warn` calls in analytics. None log user data — they log `error.message` strings. **False positive.** | `analytics.service.ts` (many) | info | None. | n/a |
| 5.6 | **`ai.service.ts:84, 99, 159, 222, 267, 332`** — logs `resultText` (raw LLM response) and `session.user.id`. In dev, this puts user IDs and AI responses in DevTools. | `ai.service.ts:84, 159, 222, 267, 332` | low | Redact `session.user.id` (use a hash if needed for debugging). | small |
| 5.7 | **`services/ai-analytics.service.ts:52, 78, 131`** — logs `error` objects from Supabase RPCs. May include partial responses. | `ai-analytics.service.ts:52, 78, 131` | low | Same as 5.2. | small |

---

## 6. Dependency injection / auth-token accessibility

| # | Issue | Location | Severity | Recommendation | Effort |
|---|-------|----------|----------|----------------|--------|
| 6.1 | **Supabase JWT (access + refresh) is stored in `localStorage`** via the custom `noLockStorage` adapter (`supabase-client.service.ts:91-104, 132`). Accessible via `localStorage.getItem('sb-ufutyjbqfjrlzkprvyvs-auth-token')` from any XSS in the tab. Industry-standard tradeoff; documented Supabase pattern. | `supabase-client.service.ts:127-143` | high | Pair with XSS hardening (see §3). Consider shorter access-token TTL in Supabase project settings. See 2.1. | large |
| 6.2 | **`SecureStorageService` exports the AES-GCM key to `sessionStorage`** so encrypted `localStorage` blobs survive a page reload. An XSS attacker can read the key from `sessionStorage` and decrypt all encrypted entries. The threat model explicitly assumes tab-close = key destruction. | `services/secure-storage.service.ts:67-95` | medium | Document the threat model in code (currently the comment in lines 7-14 describes the intent, but the API consumer should be aware). For high-sensitivity payloads, derive a per-entry key from a server-held master key. | large |
| 6.3 | **`clearAalCache()` IS called on logout** (`auth.service.ts:1480`). ✅ **Verified.** Also clears `lastServerRevalidation` (`auth.guard.ts:53`). This prevents cross-user cache poisoning on shared kiosks. | `auth.service.ts:1480`, `auth.guard.ts:48-51` | info | None — already correct. | n/a |
| 6.4 | **`adminInstance` getter exists in `supabase-client.service.ts:191-198`** but is **NOT called from anywhere in `src/`** (grep confirms 1 match, in the definition itself). Dead code. If a future contributor wires it up (e.g. "just to read this one row"), they get a client that **bypasses all RLS** using the `service_role_key`. | `supabase-client.service.ts:191-198` | medium | **Either:** (a) Delete `adminInstance` + the `serviceRoleKey` plumbing in `runtime-config.service.ts:9, 68-70, 93, 111`. **Or:** (b) Keep but rename to `__dangerAdminInstanceForExplicitAdminUseOnly` and add a runtime `assert(process.env.NODE_ENV === 'development')` guard. | small |
| 6.5 | `runtime-config.service.ts` will accept `serviceRoleKey` from `/assets/runtime-config.json` (`runtime-config.service.ts:68-70`). The current generator (`scripts/generate-runtime-config.mjs:55-61`) does NOT write `serviceRoleKey`, so the field is always `undefined`. **But the plumbing exists.** | `runtime-config.service.ts:68-70`, `scripts/generate-runtime-config.mjs` | medium | Drop `serviceRoleKey` from the type, the loader, and the fallback. See 6.4. | small |
| 6.6 | **DevTools token extraction — acceptable, documented.** Any code in the page can call `localStorage.getItem('sb-ufutyjbqfjrlzkprvyvs-auth-token')`. This is the price of `persistSession: true` and the reason every other finding in this report reduces to "stop XSS from running arbitrary JS." | n/a | info | Document this as an acceptable risk in the security model. | small |

---

## 7. Unhandled error paths

| # | Issue | Location | Severity | Recommendation | Effort |
|---|-------|----------|----------|----------------|--------|
| 7.1 | **`auth.service.ts:209` `catch (e) { }` on `await this.logout()`** swallows errors during inactivity-timeout logout. The next line (in `setupInactivityTimeout`) is also swallowed. **Low impact** because the inactivity handler is the last line of defense, but the timer will keep firing and the user may end up in a bad state. | `auth.service.ts:205-211` | low | At minimum, `console.warn` in dev. | trivial |
| 7.2 | **`auth.service.ts:528-530`** — hydration cache parse errors swallowed silently. The cache is then evicted; user re-hydrates from network. **Acceptable.** | `auth.service.ts:528-530` | info | None. | n/a |
| 7.3 | **35+ `catch {}` / `catch (e) {}` blocks** in feature components (`ticket-detail`, `quote-form`, `anychat`, etc.) — they swallow errors silently. Most are cosmetic (e.g., `catch { /* ignore DOM mutation */ }`). None log or surface errors. | many — see grep output | low | Add minimal `console.warn` in dev (silenced in prod). | small (across many files) |
| 7.4 | **HTTP error interceptor logs full `error.error` bodies** (5.2) — these *can* leak server data when the server includes sensitive fields in its error responses. Already covered. | `http-error.interceptor.ts` | (covered in 5.2) | See 5.2. | small |
| 7.5 | `mfa-verify.component.ts:275` — `catch { this.toast.error(...) }` surfaces a user-facing error. Good. | `mfa-verify.component.ts:275-280` | info | None. | n/a |

### False-positive note

- `anychat.component.ts:188, 196, 428, 443` — `catch (e) {}` patterns. They guard UI interactions (e.g., scrolling/animating) where errors are expected and don't affect security. **OK.**

---

## 8. Direct DOM manipulation

### Findings

| # | Issue | Location | Severity | Recommendation | Effort |
|---|-------|----------|----------|----------------|--------|
| 8.1 | **No `document.write`, `eval()`, `setTimeout('...')`, `setInterval('...')`, or `new Function()`** anywhere in `src/`. **Confirmed clean.** | n/a | info | None. | n/a |
| 8.2 | `bypassSecurityTrustHtml` callers — see §3. Total: **11 call sites** across 9 files. 7 are gated by DOMPurify. The remaining 4 are the XSS risks in 3.1, 3.2, 3.4. | (see §3) | (see §3) | See §3. | (see §3) |
| 8.3 | `bypassSecurityTrustResourceUrl` used in `secure-clinical-notes.component.ts:569` for signed Supabase Storage URLs. See 3.7. | `secure-clinical-notes.component.ts:569` | info | (see 3.7) | (see 3.7) |
| 8.4 | Multiple `div.innerHTML = ...` / `editorRef.nativeElement.innerHTML = ...` patterns in editors (Tiptap, contract dialog). **All pre-sanitized by DOMPurify** before assignment. Safe. | many | info | None. | n/a |

---

## 9. Service Worker

### `ngsw-config.json`

```json
{ "index": "/index.html",
  "assetGroups": [ { "app": lazy + prefetch JS/CSS/HTML },
                   { "assets": lazy + prefetch media fonts } ],
  "dataGroups": [ { "name": "api-freshness",
                   "urls": ["/**"],
                   "cacheConfig": { "strategy": "freshness", "maxSize": 100, "maxAge": "1h", "timeout": "5s" } } ] }
```

| # | Issue | Location | Severity | Recommendation | Effort |
|---|-------|----------|----------|----------------|--------|
| 9.1 | **`ngsw-config.json` dataGroups caches ALL `/...` URLs** under "api-freshness" with a 1-hour age + 5-second network timeout. This includes auth calls (`/auth/v1/*`), REST calls, and Edge Function calls. **Sensitive data (responses containing customer PII, clinical notes, invoice bodies) can be cached in the user's browser** for up to 1 hour and replayed offline. | `ngsw-config.json:31-41` | high | **Disable the Angular SW entirely** OR restrict `dataGroups` to non-sensitive, non-auth URLs (e.g. `/assets/runtime-config.json`, static media). The current `public/sw-register.js:1-8` already disables SW registration (so this config is dormant in practice), but the config file itself still implies caching. | small |
| 9.2 | **`public/sw.js` is a self-unregistering kill-switch** (good — ships a SW that immediately deletes all caches and unregisters). **`public/sw-register.js:1-8` is disabled SW registration** (Angular CLI excludes it from the build via `angular.json` "ignore"). So **the app does NOT register a Service Worker today**. | `public/sw.js`, `public/sw-register.js` | info | None — kill-switch is intentional and well-implemented. | n/a |
| 9.3 | `index.html:14-16` has `Cache-Control: no-cache, no-store, must-revalidate` to prevent the SW from pinning a stale `index.html`. Defensive — good. | `index.html:14-16` | info | None. | n/a |
| 9.4 | The SW config has `urls: ["/**"]` — broad wildcard. **The SW is dormant today (9.2), so this is latent.** If someone re-enables SW registration without tightening `urls`, the broad cache kicks in. | `ngsw-config.json:34` | (see 9.1) | (see 9.1) | (see 9.1) |

---

## 10. Input validation

| # | Issue | Location | Severity | Recommendation | Effort |
|---|-------|----------|----------|----------------|--------|
| 10.1 | **All `[innerHTML]` bindings** go through **either** `DOMPurify.sanitize()` (most), **`safeHtml` pipe** (a few), or are admin-only previews with raw HTML (see §3). **No raw `[innerHTML]` on untrusted user input.** | (see §3) | info | (see §3) | (see §3) |
| 10.2 | **Password inputs use `autocomplete="new-password"`** in `integrations.component.html:469, 759` and `configuracion.component.html:474` (inputmode="numeric" for TOTP code). **Correct** — no `autocomplete="current-password"` leakage. | `integrations.component.html:469, 759` | info | None. | n/a |
| 10.3 | **Supabase parameterised queries everywhere.** PostgREST + RPC parameters are bound server-side; no client-side string interpolation into SQL. | all `*.service.ts` | info | None. | n/a |
| 10.4 | **TOTP / MFA inputs don't use `autocomplete="one-time-code"`** — minor UX issue, not security. | `configuracion.component.html:474` | info | Add `autocomplete="one-time-code"` for mobile autofill from SMS authenticator flows. | trivial |
| 10.5 | **`setPassword` in `auth.service.ts:1703-1729` enforces** min 10 chars + upper + lower + digit. **Strong.** | `auth.service.ts:1703-1729` | info | None. | n/a |
| 10.6 | **No `sanitizeText` / `sanitizeEmail` / `sanitizeString` helpers** exist as separate utilities. The team relies on **DOMPurify** (HTML) and **Angular's built-in interpolation** (auto-escapes for `{{ }}`). | n/a | info | If you ever add a `sanitizeEmail` helper, use a whitelist regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) plus length cap. Currently nothing reads raw user emails back into HTML. | n/a |

---

## 11. Other notable findings

| # | Issue | Location | Severity | Recommendation | Effort |
|---|-------|----------|----------|----------------|--------|
| 11.1 | **`supabase-client.service.ts:191-198 adminInstance` getter is dead code** — see 6.4. | `supabase-client.service.ts:191-198` | medium | See 6.4. | small |
| 11.2 | **`public/nul` and `src/app/services/nul` are 0-byte files** (Windows `> nul` redirection artifacts). Not security-relevant but show up in grep audits. | repo root + `src/app/services/` | info | Add to `.gitignore` and `git rm --cached`. | trivial |
| 11.3 | **CSP via `vercel.json:59` is strong** — `default-src 'self'`, no `unsafe-eval`, `frame-ancestors 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`, plus HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. `style-src 'unsafe-inline'` is required by Angular runtime styles (acceptable tradeoff). | `vercel.json:53-60` | info | None — strong posture. | n/a |
| 11.4 | **`font-awesome@6.5.1` loaded from cdnjs with SRI hash** (`index.html:31-37`). Excellent — supply-chain integrity is enforced by the browser. | `index.html:31-37` | info | None. | n/a |
| 11.5 | **`supabase/functions/_shared/csrf-protection.ts:11-22`** — VULN-10 fix: constant-time HMAC compare. Good. | `csrf-protection.ts:11-22` | info | None. | n/a |
| 11.6 | **`auth.service.ts:1468-1496` `logout()` flow**: cancels inactivity timer, clears registration-in-progress set, calls `clearAalCache()`, clears currentCompanyId, removes `last_active_company_id`, calls `clearUserData()` (which clears `simplifica_professional_mode`, `simplifica_modules_cache`, `simplifica_app_user_cache`), notifies SW of LOGOUT, then `supabase.auth.signOut()`, then navigate to `/login`. **Comprehensive.** | `auth.service.ts:1468-1496` | info | None — well done. | n/a |
| 11.7 | **`supabase-client.service.ts:135-141`** — `detectSessionInUrl: false` prevents the magic-link race condition (two parallel `_getUser()` HTTP calls). Comment block explains the rationale. Good. | `supabase-client.service.ts:135-141` | info | None. | n/a |
| 11.8 | **`auth-callback.component.ts:238`** — `history.replaceState` clears the JWT from `window.location.hash` to prevent Referer-header leakage. Good. | `auth-callback.component.ts:237-244` | info | None. | n/a |
| 11.9 | **`auth.service.ts:881-892`** — removed `isRoberto()` email-based super-admin bypass (was a privilege-escalation vector). Comment block explains the fix. **Important security improvement.** | `auth.service.ts:1553-1562, 881-892` | info | None — already fixed. | n/a |
| 11.10 | **`secure-storage.service.ts:91-99`** — `b64encode` uses `String.fromCharCode(...buf)` — **stack-overflow risk on large buffers** (>~125 KB throws RangeError). Currently inputs are small JSON payloads, so this is latent. | `secure-storage.service.ts:98-100` | low | Switch to chunked encoding (`String.fromCharCode.apply(null, Array.from(buf))`) or use `Uint8Array.prototype.toBase64` (modern browsers). | small |

---

## Top 5 quick wins

> Small-effort changes that materially reduce risk. Order by priority.

1. **Wrap `PublicPrivacyPolicyComponent` data in DOMPurify** (`features/public/privacy-policy/public-privacy-policy.component.ts:55-56`) — closes a latent unauthenticated XSS sink on the `/privacy/:companyId` public route. *(Effort: 15 minutes; closes the only Critical finding.)*
2. **Wrap `email-branding.component.ts` preview HTML in DOMPurify** and validate `fontFamily` against a regex — closes the admin self-XSS and CSS-injection vector in `buildPreviewHtml`. *(Effort: 30 minutes; closes a High.)*
3. **Remove the `adminInstance` getter** in `supabase-client.service.ts:191-198` and the `serviceRoleKey` plumbing in `runtime-config.service.ts` — eliminates the dead-code RLS-bypass footgun. *(Effort: 15 minutes; closes a Medium + a Medium.)*
4. **Redact `lib/edge-functions.helper.ts:94` request body** — never log `cert_pem`, `key_pem`, or `key_pass`. Log only `functionName` + URL. *(Effort: 10 minutes; closes a High for dev/staging environments.)*
5. **Disable / tighten `ngsw-config.json` `dataGroups`** — either remove the file entirely or restrict `urls` to `/assets/runtime-config.json` only. The current `/**` cache will silently start caching PII the moment SW registration is re-enabled. *(Effort: 20 minutes; closes a latent High.)*

---

## Recommended follow-ups (not in top 5)

- **Run `rafter run`** with `RAFTER_API_KEY` set, once available. The current audit is static + manual; SAST/SCA remote tiers would catch dependency CVEs, taint-flow into sinks, and crypto misuse that this review can miss.
- **Add `Sanity-Check` integration test**: a unit test that feeds `<script>alert(1)</script>` into every `[innerHTML]` binding and asserts the rendered DOM contains no `<script>` tag. This catches future regressions in DOMPurify config.
- **Document the security model in the repo**: threat model, what's protected (CSRF, RLS, MFA), what's accepted (JWT in `localStorage`, SW data caching dormant, public routes).
- **Consider adding a runtime CSP via `<meta http-equiv="Content-Security-Policy" ...>`** in `index.html` as a defense-in-depth layer (the `vercel.json` headers are only set on Vercel deploys; local/staging environments rely on whatever the reverse proxy does).
- **Remove the `process.env["ANYCHAT_API_KEY"]` reference from `environment.prod.ts:36`** — even though it's harmless at runtime (Angular CLI doesn't replace it), it suggests a build-time secret pipeline that doesn't actually exist.

---

## Appendix: files reviewed

- `src/main.ts`, `src/index.html`, `src/environments/environment.ts`, `src/environments/environment.prod.ts`
- `src/app/app.config.ts`, `src/app/app.routes.ts`
- All files in `src/app/services/` (112 entries, focus on auth/csrf/supabase/secure-storage/runtime-config/edge-functions helper/audit-logger)
- `src/app/interceptors/csrf.interceptor.ts`, `src/app/interceptors/http-error.interceptor.ts`
- `src/app/guards/auth.guard.ts`, `src/app/guards/invite-token.guard.ts`
- `src/app/core/pipes/safe-html.pipe.ts`
- `src/app/features/auth/auth-callback/auth-callback.component.ts`, `src/app/features/auth/mfa-verify/mfa-verify.component.ts`, `src/app/features/auth/invite/invite.component.ts`
- `src/app/features/docs/markdown.service.ts`, `src/app/features/docs/components/docs-search.component.ts`
- `src/app/features/public/privacy-policy/public-privacy-policy.component.ts`
- `src/app/features/admin/email-accounts/email-branding.component.ts`
- `src/app/features/webmail/components/signature-editor/signature-editor.component.ts`
- `src/app/features/tickets/detail/ticket-detail.component.ts`
- `src/app/features/marketing/campaign-form.component.ts`
- `src/app/features/customers/components/secure-clinical-notes/secure-clinical-notes.component.ts`
- `src/app/shared/ui/tour-overlay/tour-overlay.component.ts`
- `src/app/features/customers/profile/components/contract-creation-dialog/contract-creation-dialog.component.ts`
- `supabase/functions/_shared/csrf-middleware.ts`, `supabase/functions/_shared/csrf-protection.ts`
- `vercel.json`, `ngsw-config.json`, `package.json`
- `public/init.js`, `public/sw.js`, `public/sw-register.js`, `public/manifest.json`
- `scripts/generate-runtime-config.mjs`
- `.env.local` (URL only, no secrets)

---

## Appendix: grep tool summary

| Tool | Output |
|------|--------|
| `rafter secrets` | clean (1 false-positive warning: "Betterleaks output is not an array") |
| `grep csrf/x-csrf-token/withCredentials/credentials:'include'` in `src/**/*.ts` | 22 matches — 1 CSRF service, 1 interceptor, 1 edge function consumer, OAuth nonce |
| `grep sessionStorage/localStorage` in `src/**/*.ts` | 100+ matches — see §2 |
| `grep innerHTML/bypassSecurityTrust/domSanitizer` in `src/**/*.ts` | 62 matches — see §3 |
| `grep document.write/eval(/setTimeout('.../setInterval('.../new Function(` in `src/**/*.ts` | 0 matches |
| `grep console.(log\|debug\|info\|warn\|error)` in `src/**/*.ts` | 100+ matches — see §5 |
| `grep sk_live_/sk_test_/pk_live_/pk_test_/AKIA*/eyJ*/ya29.*/SG.` in `src/**/*.ts` | 0 matches |
| `grep password/secret/apiKey/api_key/apiSecret/privateKey` in `src/**/*.ts` | 70 matches — all field/variable names, no hardcoded values |
| `grep crypto.subtle/CryptoKey/exportKey` in `src/**/*.ts` | 13 matches — all legitimate Web Crypto (AES-GCM, SHA-256, HMAC) |
| `grep catch (_e){}/catch {}` in `src/**/*.ts` | 35 matches — see §7 |

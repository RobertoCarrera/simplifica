# Frontend Auth Layer Audit — Simplifica CRM
**Date:** 2026-06-22
**Scope:** `src/app/guards/`, `src/app/core/guards/`, `src/app/app.routes.ts`, `src/app/services/auth.service.ts`, `src/app/interceptors/`, lazy-loaded route files.
**Mode:** Read-only analysis. No files modified.

---

## 1. Guard Inventory

| Guard | File | Lines | Role | Robustness |
|---|---|---|---|---|
| `AuthGuard` | `guards/auth.guard.ts` | 56-154 | Generic auth + AAL2 step-up | Strong (with caveats on network error) |
| `AdminGuard` | `guards/auth.guard.ts` | 156-220 | owner/admin/super_admin, 30s server revalidation | Strong |
| `GuestGuard` | `guards/auth.guard.ts` | 222-255 | Redirects logged-in users from auth pages | Strong |
| `StrictAdminGuard` | `guards/auth.guard.ts` | 257-314 | admin/super_admin only, forces MFA enrollment | Strong |
| `SuperAdminGuard` | `guards/auth.guard.ts` | 316-349 | super_admin only | Strong |
| `OwnerAdminGuard` | `guards/auth.guard.ts` | 351-421 | owner/admin/member/super_admin | Strong |
| `StaffGuard` | `core/guards/staff.guard.ts` | 18-104 | Staff roles only, AAL2 step-up | Strong |
| `MfaStepUpGuard` | `core/guards/mfa-stepup.guard.ts` | 5-29 | Per-area MFA re-prompt (30-min session) | Medium (uses sessionStorage only) |
| `NotEmergencySuperAdminGuard` | `core/guards/not-emergency-guard.ts` | 15-25 | Blocks super_admin from `/complete-profile` | Strong (UI only) |
| `ModuleGuard` | `guards/module.guard.ts` | 22-118 | Module enabled + sidebar visibility | Strong (with fail-open on visibility fetch) |
| `InviteTokenGuard` | `guards/invite-token.guard.ts` | 10-42 | Requires `token` query/hash param | Medium (no token validation, just presence) |

**Guards are well-designed in isolation.** The issues are in *composition*: how they're attached (or not) to routes, and how they fail.

---

## 2. Route Inventory & Coverage

**Total route entries in `app.routes.ts`:** 42 (excluding `redirectTo` and `**`).
**Routes by protection level:**

| Protection | Count | Routes |
|---|---|---|
| Strong role guard (e.g., `StrictAdminGuard`, `SuperAdminGuard`, `OwnerAdminGuard`) | 22 | `/webmail-admin`, `/clientes-gdpr`, `/gdpr`, `/productos`, `/servicios`, `/configuracion/permisos`, `/configuracion/estados`, `/configuracion/unidades`, `/configuracion/verifactu`, `/configuracion/presupuestos`, `/configuracion/presupuestos/notificaciones`, `/configuracion/facturacion`, `/configuracion/automatizaciones`, `/configuracion/etiquetas`, `/empresa`, `/admin/email-accounts`, `/settings/inbound-mail`, `/admin/inbound-mail`, `/admin/system-health`, `/facturacion/series`, `/presupuestos` |
| `StaffGuard` only (any staff role) | 9 | `/inicio`, `/clientes`, `/clientes/:id`, `/webmail`, `/docs`, `/facturacion`, `/facturacion/:id`, `/marketing`, `/marketing/campaigns/*` |
| `AuthGuard` only (any logged-in user) | 5 | `/tickets/:id`, `/notifications`, `/booking/:id`, `/admin/email-accounts/oauth-callback`, `/mfa-verify` |
| `ModuleGuard` (with `AuthGuard`) | 7 | `/tickets`, `/dispositivos`, `/chat`, `/analytics`, `/reservas`, `/reservas/conciliacion`, `/waitlist`, `/projects` |
| **No guard at all** | **3** | **`/configuracion`, `/auth/callback`, `/auth/confirm`** |
| Public legal (intentional) | 4 | `/privacy`, `/privacy/:companyId`, `/terms-of-service`, `/aviso-legal` |
| MFA step-up (with auth + role) | 2 | `/clientes-gdpr`, `/gdpr` (uses `MfaStepUpGuard` with `data: { stepUpArea: 'gdpr' }`) |

---

## 3. Findings

### CRITICAL

#### C-1: `/configuracion` route has empty guards array
- **File:line:** `src/app/app.routes.ts:260`
- **Issue type:** Missing guard
- **Severity:** **Critical**
- **Detail:**
  ```ts
  { path: "configuracion",
    loadComponent: () => import("...configuracion.component").then(m => m.ConfiguracionComponent),
    canActivate: [],
    pathMatch: "full"
  }
  ```
  The main settings page is reachable by **any** visitor — including unauthenticated ones — by typing `/configuracion`. The component then attempts to load data (profile, units, modules, etc.) and the `canManageSettings` / `isSuperAdmin` getters are evaluated; the page renders structure even if data fetches fail. Sub-routes under `/configuracion/*` are correctly guarded with `[AuthGuard, OwnerAdminGuard]`, so the parent route is the gap.
- **Exploitation scenario:** Unauthenticated attacker types `/configuracion` in the address bar. The component loads. Although API calls fail, the page exposes: (a) existence and labels of admin-only tabs (security, GDPR, verifactu, etc.); (b) the configuration form skeleton; (c) any client-side defaults rendered before failure (currency lists, language options, payment method list, etc.). This is **information disclosure** + confirms the existence of a CRM at the URL.
- **Recommended fix:** Add `[AuthGuard]` to the base route:
  ```ts
  { path: "configuracion", canActivate: [AuthGuard], pathMatch: "full", loadComponent: ... }
  ```
  Or — better — add `[AuthGuard, OwnerAdminGuard]` so non-admin users get redirected away.

#### C-2: HTTP 401 does not trigger session cleanup or redirect
- **File:line:** `src/app/interceptors/http-error.interceptor.ts:86-93`
- **Issue type:** Session lifecycle
- **Severity:** **Critical**
- **Detail:** On a 401 response, the interceptor only logs the error and throws a custom message. It does **not** call `authService.signOut()`, clear `currentUser$`/`userProfile$`, or redirect to `/login`. The `signals.isAuthenticated` remains `true`, sidebar stays visible, the user keeps navigating the app in a broken state, and every subsequent API call surfaces the same toast.
- **Exploitation scenario:** A user's access_token expires mid-session (Supabase JWT TTL is 1h by default; refresh token is the second factor). After expiry, the user sees random "No autorizado" toasts in unrelated actions. If the user is in the middle of a sensitive workflow (e.g., editing a client's GDPR data in `/clientes-gdpr`), the UI may render the form but fail to save. Worse: the cached profile in sessionStorage (`simplifica_app_user_cache`) keeps the sidebar rendered, so a user with a stale-but-not-cleaned session can still attempt API calls (which Supabase RLS still denies — but the UX is broken). There is no automatic token-refresh trigger wired in.
- **Recommended fix:** Add a 401 handler in the interceptor:
  ```ts
  else if (error.status === 401) {
    if (!req.url.includes('/auth/v1/token')) {  // don't loop on refresh
      this.authService.signOut().then(() => this.router.navigate(['/login']));
    }
  }
  ```
  Or add a global `tap(() => ...)` to detect auth state and react. Reference: Supabase docs recommend listening to `onAuthStateChange('TOKEN_REFRESHED')` and `'SIGNED_OUT'` events.

#### C-3: Multiple guards fail-open on MFA/network errors
- **Files:lines:**
  - `src/app/guards/auth.guard.ts:126` (AuthGuard)
  - `src/app/guards/auth.guard.ts:311` (StrictAdminGuard.checkMfa)
  - `src/app/guards/auth.guard.ts:418` (OwnerAdminGuard.checkMfa)
  - `src/app/core/guards/staff.guard.ts:99` (StaffGuard)
  - `src/app/guards/module.guard.ts:85` (ModuleGuard.checkSidebarVisibility)
- **Issue type:** Error handling in guards
- **Severity:** **Critical** (MFA failure → privilege bypass)
- **Detail:** Every MFA check (`getAuthenticatorAssuranceLevel()`) has the pattern:
  ```ts
  catchError(() => of(true as boolean | UrlTree))
  ```
  This means **if the MFA server call fails for any reason** — network down, 5xx from Supabase, CORS, timeout — the user is **let through without AAL2 verification**. The 8-second `timeout(8000)` only triggers on the outer pipe; once the inner `getAuthenticatorAssuranceLevel()` errors, the catch is inside the inner pipe.
- **Exploitation scenario:** An attacker who can DoS or slow the Supabase MFA endpoint (or simply disconnect the user from that specific endpoint via DNS poisoning on a hostile network) can cause the `aal2` check to fail repeatedly. The guard returns `true`, and the user accesses admin routes without step-up verification. Combined with the cached AAL (`aalCacheByUser` TTL 5 min, `auth.guard.ts:30-31`), this means: an attacker who forces one MFA failure during the cache window can bypass MFA for the next 5 minutes.
- **Recommended fix:** On MFA check failure, redirect to `/login` or a degraded-mode page instead of allowing access:
  ```ts
  catchError(() => {
    this.router.navigate(['/login'], { queryParams: { reason: 'mfa_unavailable' } });
    return of(false as boolean | UrlTree);
  })
  ```
  Or — if fail-open is intentional for UX — gate it behind a feature flag and add server-side enforcement for all admin mutations.

#### C-4: `/auth/callback` and `/auth/confirm` have no guards
- **File:line:** `src/app/app.routes.ts:447, 454`
- **Issue type:** Missing guard (intentional, but unprotected)
- **Severity:** **Critical** (in context of state-pollution risk)
- **Detail:** These routes are intentionally unguarded so they can be hit during the OAuth/magiclink/email-confirmation flow. However, **the route loader accepts any `access_token` / `refresh_token` from the URL hash and calls `auth.setSession()`** (`auth-callback.component.ts:195-199`). The component checks `ALLOWED_CALLBACK_TYPES = ['invite', 'recovery', 'signup', 'magiclink', 'email']` and uses a 6-second `waitForProfile`, but the **state parameter (PKCE) is not validated** — only the type is. An attacker who can craft a URL like `https://app/auth/callback#access_token=ATTACKER_TOKEN&refresh_token=ATTACKER_REFRESH&type=magiclink` and trick a victim into opening it (phishing, XSS in a different tab, etc.) could potentially:
  1. Set a session under the attacker's account on the victim's browser
  2. The victim's subsequent actions get mixed with the attacker's profile (e.g., the user "creates" data that gets persisted under the attacker's company_id)
- **Exploitation scenario:** A successful phishing email links to `https://app.simplifica.com/auth/callback#access_token=...&type=magiclink`. The victim clicks, the page calls `setSession(attacker_tokens)`, the app is now "logged in as the attacker". The victim then enters a new client's personal data thinking they're working in their own account — but it's persisted to the attacker's company.
- **Recommended fix:** Add `state` parameter validation against a session-stored PKCE state (same pattern as `integrations.component.ts:330-335` does for OAuth CSRF). Also: at minimum, require an explicit `returnTo` confirmation dialog or send the user through `/login` for credential re-entry if the flow is unexpected.

#### C-5: `/admin/email-accounts/oauth-callback` lacks role guard and CSRF state check
- **File:line:** `src/app/app.routes.ts:413`, `src/app/features/admin/email-accounts/email-config/oauth-callback.component.ts:24-50`, `src/app/features/admin/email-accounts/email-config/email-config.service.ts:97-127`
- **Issue type:** Weak guard + missing CSRF state validation
- **Severity:** **Critical**
- **Detail:** The route only has `[AuthGuard]` — any logged-in user (including `client` role) can hit it. The component reads `code`, `state`, `account_id` from the query string and **passes `state` directly to the backend edge function** without validating it against a session-stored CSRF nonce. Compare with `integrations.component.ts:330-335` which does validate:
  ```ts
  const storedNonce = sessionStorage.getItem('oauth_csrf_nonce');
  if (!storedNonce || storedNonce !== returnedNonce) { /* reject */ }
  ```
  The email-accounts flow does **not** have this protection on the frontend. The state is just forwarded to the backend, which means CSRF protection depends entirely on whether the backend edge function validates state.
- **Exploitation scenario:** Attacker crafts a URL `https://app/admin/email-accounts/oauth-callback?code=ATTACKER_CODE&state=ANY&account_id=VICTIM_ACCOUNT_ID` and sends it to a logged-in victim (e.g., embedded in a phishing email or via tabnabbing). If the backend doesn't re-validate state, the attacker's Google OAuth code gets bound to the victim's email account — the attacker now has refresh tokens to read the victim's email.
- **Recommended fix:**
  1. Add `[AuthGuard, AdminGuard]` to the route (it should never be hit by non-admins)
  2. Add the same CSRF nonce check as in `integrations.component.ts`:
     ```ts
     const storedNonce = sessionStorage.getItem('email_oauth_nonce');
     if (!storedNonce || storedNonce !== state) { /* reject */ }
     ```
  3. Also validate `account_id` belongs to the user's company (RLS should enforce this server-side, but the frontend should double-check).

---

### HIGH

#### H-1: Client-side role hiding in configuracion assumes route is protected
- **File:line:** `src/app/features/settings/configuracion/configuracion.component.html:55, 99, 110, 140, 151, 162` and `.ts:219-267`
- **Issue type:** Client-only check (compounded by C-1)
- **Severity:** **High** (because of C-1)
- **Detail:** The configuracion page hides admin tabs via:
  ```html
  @if (canManageSettings || isSuperAdmin) { ... }
  @if (isOwnerOrSuperAdmin) { ... }
  ```
  These are pure UI gates. They depend on `authService.userRole()` / `userProfile.is_super_admin` which are populated from the DB. If a user has elevated claims in their JWT or sessionStorage cache (e.g., from C-3 MFA bypass or a stale cache from C-2), the UI would render the admin tabs. **But because the route is itself unguarded (C-1), even without those claims the page loads.**
- **Exploitation scenario:** Combine with C-1 (no guard) and C-3 (MFA fail-open) — a non-admin user who lands on `/configuracion` with a broken MFA check sees the page load. Even with the role gates, the page structure is exposed.
- **Recommended fix:** Once C-1 is fixed, the client-side gates are defensible as defense-in-depth. Add a server-side check for any state-mutating actions in configuracion.

#### H-2: AAL cache is 5 minutes and process-global
- **File:line:** `src/app/guards/auth.guard.ts:25-55`
- **Issue type:** Session lifecycle
- **Severity:** **High**
- **Detail:** `aalCacheByUser` is a module-level `Map` keyed by user ID. TTL is 5 minutes. Within that window, the guard trusts the cached AAL level. If a user's role changes mid-session (e.g., admin demoted to member, or MFA removed by an admin), the cache doesn't invalidate. The `lastServerRevalidation` map in `AdminGuard` is only 30s, but `AuthGuard`'s AAL cache is 5min.
- **Exploitation scenario:** An admin demoted to member still gets `aal2` cache hits for 5 minutes. They can still reach admin routes that only require AAL2 (not role). Combined with C-3, the window extends to 5 min of privilege persistence.
- **Recommended fix:** Reduce AAL cache TTL to 30s (match `AdminGuard` revalidation) or invalidate on every navigation. Better: don't cache AAL at all and re-check on every route activation.

#### H-3: SessionStorage profile cache hydrates UI for 5 minutes
- **File:line:** `src/app/services/auth.service.ts:495-531` (`_hydrateFromCache`)
- **Issue type:** Session lifecycle
- **Severity:** **High**
- **Detail:** `_hydrateFromCache` reads `simplifica_app_user_cache` from sessionStorage and rehydrates all signals (`isAuthenticated`, `userProfile`, `userRole`, `isSuperAdmin`, `isAdmin`, `companyMemberships`) instantly on app load if cache is < 5 min old. The real DB fetch runs in background, but until it completes, the UI is built from cached data. If a user was demoted, fired, or had their role changed since the cache was written, the first 5 minutes of the session show stale role/company state.
- **Exploitation scenario:** An admin who's been demoted to `member` 1 minute ago opens a new tab. The sidebar shows admin links (cached `isAdmin` = true), the user navigates to `/admin/system-health` (only `SuperAdminGuard` checks — if their cached `role === 'super_admin'`, this passes), and the page loads. The real Supabase RLS will block the API calls, but the UI rendered with cached role and the request fires with valid JWT.
- **Recommended fix:** Hydrate the auth state and the **role/permissions** from the DB before rendering any authed route. Or: invalidate the cache on every role change (currently no listener does this). At minimum, flush cache on `SIGNED_OUT` (which is done — `clearUserData` line 803) but also on `TOKEN_REFRESHED` and on any `onAuthStateChange` event with a different user ID.

#### H-4: Sidebar UI hiding is the only check for some actions
- **File:line:** `src/app/shared/layout/responsive-sidebar/responsive-sidebar.component.ts:775-816` and `src/app/shared/layout/mobile-bottom-nav/mobile-bottom-nav.component.ts:506-616`
- **Issue type:** Client-only check
- **Severity:** **High** (where routes are also unguarded, otherwise Medium)
- **Detail:** Both sidebar and mobile nav filter items by `userRole`, `isAdmin`, `isSuperAdmin`, `isClient`. The filtering logic reads `authService.userRole()` and `userProfile.is_super_admin`. For most admin routes, the route guard provides a second line of defense. But the **sidebar uses these checks as the *primary* gate for showing/hiding items** — there's an implicit assumption that "if we don't show it, they can't navigate there". This is the classic insecure-direct-object-reference / security-through-obscurity problem: a user who knows the URL can bypass the sidebar.
- **Exploitation scenario:** A `member` user opens DevTools, looks at the route config, and types `/admin/email-accounts/oauth-callback` — the sidebar never shows this link, but the route only has `[AuthGuard]`. The route loads. The OAuth callback logic runs. (See C-5 for the OAuth-specific amplification.)
- **Recommended fix:** Audit all `*ngIf` / `@if` blocks in the sidebar/nav. For each, verify the corresponding route has a stronger guard than just `AuthGuard`. Add route-level role checks for any "admin-only" item currently hidden only via the sidebar.

#### H-5: Multi-tab token race + `supabase.auth.stopAutoRefresh()` on visibility hidden
- **File:line:** `src/app/services/auth.service.ts:174-187`
- **Issue type:** Session lifecycle
- **Severity:** **High**
- **Detail:** When the tab is hidden, the handler calls `this.supabase.auth.stopAutoRefresh()`. The comment notes: "since we have locks disabled in SupabaseClientService". When the tab becomes visible, it calls `startAutoRefresh()` and `getSession()`. But the logic does not re-validate AAL, does not re-check role, and does not handle the case where the session in another tab has been signed out.
- **Exploitation scenario:** User has the app open in 2 tabs. In tab A, they sign out. In tab B, the visibility handler doesn't fire (tab is foreground) and the session is invalidated by Supabase in another tab. Tab B continues rendering the UI with `isAuthenticated = true` and `userProfile` populated. All API calls fail with 401, but the user is not redirected (C-2).
- **Recommended fix:** Listen to `BroadcastChannel('auth')` or `storage` events to detect cross-tab sign-out. Force-reload the auth state on visibility visible.

#### H-6: Routes with only `AuthGuard` for sensitive resources
- **File:line:** `src/app/app.routes.ts:106, 177, 249, 413`
- **Issue type:** Weak guard
- **Severity:** **High**
- **Detail:** These routes only have `[AuthGuard]`:
  - `/tickets/:id` (line 106) — ticket detail. Any logged-in user can read any ticket by guessing the UUID. RLS will block the API call, but the page still loads and the user sees "loading…" indefinitely. If a future developer adds a non-RLS-protected query, it's exposed.
  - `/notifications` (line 177) — generally fine, notifications are per-user.
  - `/booking/:id` (line 249) — confirm session. This is a workflow that mutates state.
  - `/admin/email-accounts/oauth-callback` (line 413) — see C-5.
- **Exploitation scenario:** A `client` role user (not staff) is not redirected from `/tickets/:id` — they get a blank page with a "loading" state. Not a data breach, but a UX issue and a defense-in-depth gap.
- **Recommended fix:** Add `StaffGuard` to `/tickets/:id` and `/booking/:id`. For `/admin/email-accounts/oauth-callback`, add `AdminGuard` (C-5).

#### H-7: `MfaStepUpGuard` uses sessionStorage as source of truth
- **File:line:** `src/app/core/guards/mfa-stepup.guard.ts:17-20`
- **Issue type:** Session lifecycle
- **Severity:** **High** (in context of shared-machine usage)
- **Detail:** The guard checks `sessionStorage.getItem('mfa_stepup_${area}')` and trusts it for 30 minutes. The comment doesn't explain *where* the timestamp is set, but presumably it's set in the `/mfa-verify` component on success. If an attacker can write to sessionStorage (XSS, dev-tools), they can set the timestamp and bypass step-up for 30 minutes. SessionStorage is per-origin, so this requires either XSS or a victim with the dev tools open.
- **Exploitation scenario:** Combined with the previous frontend XSS findings (1 critical XSS reported on 2026-06-21), an XSS payload can set `sessionStorage.mfa_stepup_gdpr = Date.now()` to grant 30 minutes of GDPR-area access without step-up.
- **Recommended fix:** Store the step-up attestation in a server-side signed token (e.g., the JWT itself with a custom claim `mfa_stepup_gdpr: <timestamp>`). Or use an HttpOnly cookie set by the backend.

---

### MEDIUM

#### M-1: `not-emergency-guard` naming is misleading
- **File:line:** `src/app/core/guards/not-emergency-guard.ts:19`
- **Issue type:** Misleading code (not a vulnerability, but it could mask a real issue during a future audit)
- **Severity:** **Medium** (code quality)
- **Detail:** The guard is named "NotEmergencySuperAdminGuard" but the function it calls `isEmergencySuperAdmin()` is just a DB-backed `is_super_admin` flag check. The comment says "Previously this guard was hardcoded to block a specific email" — meaning the legacy system was vulnerable to email-based privilege. The current implementation is correct, but the naming obscures the fact that there's no "emergency" admin role — it's just "super_admin". A future developer might add an email-based bypass thinking "emergency" means "this specific person".
- **Recommended fix:** Rename to `SuperAdminBlockOnCompleteProfileGuard` or similar. Remove the `isEmergencySuperAdmin` alias and use `isSuperAdmin` everywhere.

#### M-2: Auth-callback super-admin bypass when profile is null
- **File:line:** `src/app/features/auth/auth-callback/auth-callback.component.ts:223-228`
- **Issue type:** Bypass logic
- **Severity:** **Medium**
- **Detail:**
  ```ts
  if (profileAfter?.is_super_admin || profileAfter?.role === 'super_admin') {
    console.warn('[AUTH-CALLBACK] 🚨 SUPER ADMIN BYPASS: skipping redirect, going to /inicio');
    this.router.navigate(['/inicio']);
    return;
  }
  ```
  This bypasses the `if (!profileAfter) → /complete-profile` check for super admins. If a super admin's profile is missing (e.g., deleted from `public.users` but still has a valid `auth.users` row), they can log in and reach `/inicio`. The page will then fail to load data, but the session is established.
- **Exploitation scenario:** A super admin whose `public.users` row was deleted (deliberately or via a bug) can still authenticate. The `is_super_admin` flag is on the deleted profile, so this bypass is moot. But: if the bypass is keyed on `currentSession` (which it isn't directly, but the profile check uses `profileAfter` after `waitForProfile`) — there's a 6-second window where the profile is null and a `super_admin` claim from the JWT could pass. Currently, the bypass only triggers if `profileAfter.is_super_admin` is truthy, so it requires the profile to actually load. So the bypass is safe as written, but the comment "EMERGENCY BYPASS" suggests there was a more permissive version.
- **Recommended fix:** Remove the bypass and let the `/complete-profile` flow handle missing profiles consistently. If a "super admin needs to recover" flow is needed, build it explicitly with re-verification.

#### M-3: DevRoleService is a misnomer
- **File:line:** `src/app/services/dev-role.service.ts:13-44`
- **Issue type:** Misleading code
- **Severity:** **Medium** (code quality, not security)
- **Detail:** The service is called `DevRoleService` but the implementation just checks `userRole === 'owner' || 'admin' || 'supervisor'`. There's no "dev" role. The methods (`isDev`, `canSeeDevTools`, `canManageUsers`, `hasPermission`) all return values based on the user's actual role, not a "dev" flag. The naming makes it sound like there's a developer-only escalation.
- **Exploitation scenario:** A future developer might add a "dev" bypass in this service thinking it's a debug-only thing, exposing it in production.
- **Recommended fix:** Rename to `RoleUtilityService` or similar. Replace `isDev` with `isOwnerOrAdmin`.

#### M-4: Hardcoded professional-role check in `ModuleGuard`
- **File:line:** `src/app/guards/module.guard.ts:36-41`
- **Issue type:** Hardcoded role logic
- **Severity:** **Medium**
- **Detail:**
  ```ts
  if (moduleKey === "moduloProyectos" && this.authService.userRole() === "professional") {
    this.router.navigate(["/inicio"]);
    return false;
  }
  ```
  The "professionals cannot see projects" rule is hardcoded in the guard. There's a comment explaining it, but this is a magic string. If the rule changes (e.g., "professionals can now see projects if their company has the module"), it requires editing the guard.
- **Exploitation scenario:** None direct — but a future developer could miss this rule when adding a new module key, leading to inconsistent role-based access.
- **Recommended fix:** Move the role-to-module access matrix to a configuration object that the guard reads.

#### M-5: Inactivity timeout is 30 minutes, may surprise users
- **File:line:** `src/app/services/auth.service.ts:196-225`
- **Issue type:** Session lifecycle
- **Severity:** **Medium**
- **Detail:** 30 minutes of inactivity triggers a hard logout (`this.logout()`). For a CRM where users may be reading a long customer record, this is aggressive. There's no "are you still there?" prompt, no warning, no extension.
- **Exploitation scenario:** Not a security issue per se, but: a user filling out a long invoice is logged out silently. If the form data was in component state and not in a backend, it's lost. Combined with C-2 (no 401 handling), the user has no clear way to recover.
- **Recommended fix:** Show a modal at 25 min asking "still there?" with a 5-min auto-logout timer. Save form drafts to localStorage on inactivity warning.

#### M-6: `ModuleGuard` fails-open on sidebar visibility fetch error
- **File:line:** `src/app/guards/module.guard.ts:80-86`
- **Issue type:** Error handling
- **Severity:** **Medium**
- **Detail:** If `fetchSidebarOrder()` fails (network error), the guard **defaults to allowing access** with the comment: "default to allowing access so we don't lock users out. The sidebar itself will handle the visual filtering". This means a non-client-visible-to-team module can be reached if the sidebar fetch fails.
- **Exploitation scenario:** A `client` role user triggers a network error on the sidebar order fetch. The `ModuleGuard` lets them through to a team-only module. The page may fail to load data, but the route is exposed.
- **Recommended fix:** Fail closed on visibility fetch error, OR fetch the visibility flags as part of the modules fetch (so they fail together).

#### M-7: Catch-all redirects to `/inicio` which can loop
- **File:line:** `src/app/app.routes.ts:574`
- **Issue type:** Edge case
- **Severity:** **Medium**
- **Detail:** `path: "**"` → `redirectTo: "/inicio"`. If a user is in an inconsistent state (e.g., authenticated in Supabase but `userProfile === null` after a DB migration), `StaffGuard` redirects them to `/complete-profile` (line 35 of staff.guard.ts). If `/complete-profile` somehow fails (network error), the catch-all sends them back to `/inicio`, which sends them back to `/complete-profile`. The `NotEmergencySuperAdminGuard` adds another path. The `responsive-layout` comment at line 18-21 explicitly mentions: "infinite /login ↔ /inicio redirect loop that crashes the browser".
- **Exploitation scenario:** Not directly exploitable, but a misconfigured migration or a race during logout can trap a user.
- **Recommended fix:** Add a circuit breaker: if the same route is redirected to 3 times in 5 seconds, force-navigate to `/login` with a session-clearing effect.

#### M-8: AAL cache uses module-level Map (no Angular zone reactivity)
- **File:line:** `src/app/guards/auth.guard.ts:30`
- **Issue type:** State management
- **Severity:** **Medium**
- **Detail:** `aalCacheByUser` is a plain `Map` outside Angular's zone system. This is correct for performance (we don't want every check to trigger change detection), but it means the cache doesn't get cleared on `ngOnDestroy` or HMR. If the app hot-reloads during development, the cache persists.
- **Exploitation scenario:** Dev-time only. Not a production issue.
- **Recommended fix:** Use a `DestroyRef` to clear the cache on app teardown.

---

### LOW

#### L-1: `InviteTokenGuard` only checks token presence, not validity
- **File:line:** `src/app/guards/invite-token.guard.ts:14-26`
- **Issue type:** Weak guard
- **Severity:** **Low** (the component does the actual validation)
- **Detail:** The guard only checks that a `token` query param or an invite auth hash exists. It doesn't validate the token format. The component (`invite.component.ts`) does the actual acceptance call.
- **Exploitation scenario:** Attacker hits `/invite?token=` (empty token) → guard rejects. Attacker hits `/invite?token=AAAA` → guard passes → component attempts to use the bogus token → fails.
- **Recommended fix:** Add a basic token shape check (UUID, length, regex).

#### L-2: `email-confirmation.component.ts` uses `alert()` for errors
- **File:line:** `src/app/features/auth/email-confirmation/email-confirmation.component.ts:227, 230, 232`
- **Issue type:** UX / code quality
- **Severity:** **Low**
- **Detail:** Uses native `alert()` instead of the existing `ToastService` for resend confirmation feedback. Inconsistent UX.
- **Recommended fix:** Use `ToastService`.

#### L-3: `email-confirmation.component.ts` navigates to `/dashboard` which doesn't exist
- **File:line:** `src/app/features/auth/email-confirmation/email-confirmation.component.ts:172, 239`
- **Issue type:** Bug (security-adjacent)
- **Severity:** **Low**
- **Detail:** After email confirmation, the component navigates to `/dashboard` — but the actual route is `/inicio` (per `app.routes.ts:25`). The catch-all will redirect to `/inicio`, so this works, but it's confusing.
- **Recommended fix:** Navigate to `/inicio` directly.

#### L-4: `auth-callback` reads `decodeURIComponent` on attacker-controlled string
- **File:line:** `src/app/features/auth/auth-callback/auth-callback.component.ts:328`
- **Issue type:** Defense-in-depth
- **Severity:** **Low**
- **Detail:** `this.errorMessage = \`Error de autenticación: ${decodeURIComponent(errorDescription || authError)}\`;` — this is interpolated into the template via `{{ errorMessage }}` which Angular escapes, so no XSS. But the error message could be very long or contain newlines.
- **Recommended fix:** Truncate the error description and strip control characters.

#### L-5: `oauth-callback.component.ts` reads `window.opener.location.origin` cross-origin
- **File:line:** `src/app/features/admin/email-accounts/email-config/oauth-callback.component.ts:37, 56`
- **Issue type:** Edge case
- **Severity:** **Low**
- **Detail:** `window.opener?.location?.origin` — if `window.opener` is cross-origin (e.g., the OAuth popup was opened by a different site), reading `location` throws a `SecurityError`. The code uses optional chaining so it falls back to `window.location.origin`, which is fine. But `postMessage` is then called with the *current* origin as target — meaning a cross-origin opener (which shouldn't exist in normal flow) would still get a message from us.
- **Exploitation scenario:** None realistic in normal flow.
- **Recommended fix:** Use `window.opener?.postMessage(payload, '*')` only after explicit origin check, or close without posting if opener is cross-origin.

#### L-6: `staff.guard.ts` falls through `profile.role === "none"` to `logout` → `/login`
- **File:line:** `src/app/core/guards/staff.guard.ts:54-72`
- **Issue type:** Edge case
- **Severity:** **Low**
- **Detail:** A user with `role === "none"` is logged out. The comment says "to prevent redirect loop". The "none" role is reserved for users not yet provisioned. The logic is correct, but if the user has a valid session and the role-sync job hasn't run yet, they get force-logged-out. This may be intentional.
- **Recommended fix:** Consider a grace period or a more specific "your account is being set up" page.

---

## 4. Session Lifecycle Summary

| Event | Current Behavior | Risk |
|---|---|---|
| App start with valid session | `_hydrateFromCache` (5min TTL) + DB fetch | Stale role for up to 5min (H-3) |
| App start with no session | `/inicio` → `StaffGuard` → no profile → `/complete-profile` | OK |
| JWT expires mid-session | API calls 401, but UI shows stale state (C-2) | Broken UX, no automatic recovery |
| Token refresh | Supabase handles internally, UI not notified | OK if refresh succeeds, broken if not |
| Tab hidden > 30min | `inactivityTimer` fires `logout()` (M-5) | No warning, no recovery |
| Tab becomes visible | `startAutoRefresh()`, `getSession()` (line 181) | Doesn't re-validate AAL or role (H-5) |
| Sign out in tab A | `clearUserData()` in AuthService | Tab B doesn't know (H-5) |
| MFA check fails (network) | Returns `true` (C-3) | **MFA bypass** |
| Admin demoted to member | Cached signals persist up to 5min (H-2, H-3) | **Privilege persistence** |
| Multi-tab token race | Comment notes "locks disabled" (line 173) | Token could be invalidated in one tab, surprise 401 in another |

---

## 5. Top 5 Critical Gaps

These are the routes/flows with **no real protection** or protection that silently fails:

1. **`/configuracion` (`app.routes.ts:260`)** — empty `canActivate: []`. The main settings page is exposed. Combine with H-1 (client-side role hiding) and the fact that sub-tabs are protected, and you have an inconsistent security boundary where the parent page is open but its children are gated. **Fix:** add `[AuthGuard, OwnerAdminGuard]`.

2. **MFA enforcement fails open on error** — 5 separate `catchError(() => of(true))` blocks in `auth.guard.ts:126, 311, 418`, `staff.guard.ts:99`, `module.guard.ts:85`. A DoS of the Supabase MFA endpoint bypasses AAL2 for the entire org. **Fix:** redirect to `/login` on MFA check failure; fail closed.

3. **401 handler doesn't clear session or redirect** (`http-error.interceptor.ts:86-93`). Expired JWTs leave the user in a broken state with `isAuthenticated=true` but every API call failing. **Fix:** add a session-cleanup + redirect on 401.

4. **OAuth callback for email accounts has no CSRF state check** (`admin/email-accounts/email-config/oauth-callback.component.ts:24-50` and `email-config.service.ts:97-127`) and only `[AuthGuard]` on the route (`app.routes.ts:413`). Compare to `integrations.component.ts:330-335` which does check the CSRF nonce. **Fix:** add `AdminGuard` + nonce check.

5. **`/auth/callback` and `/auth/confirm` accept any tokens from URL hash** (`auth-callback.component.ts:195-199`). No `state` parameter validation, no PKCE check, no "is this the auth flow I started" verification. An attacker who can land a victim on `https://app/auth/callback#access_token=ATTACKER_TOKEN&refresh_token=...` can hijack the session. **Fix:** add `state` parameter validation; consider requiring fresh credential re-entry for `magiclink` and `invite` types.

---

## Appendix A: Route-by-Route Coverage Map

| Route | Guards | Effective protection |
|---|---|---|
| `/` | (redirect) | OK |
| `/inicio` | `[StaffGuard]` | Strong (with H-3 caveat) |
| `/clientes` | `[StaffGuard]` | Strong |
| `/clientes/:id` | `[StaffGuard]` | Strong |
| `/webmail-admin` | `[AuthGuard, StrictAdminGuard]` | Strong |
| `/webmail` | `[StaffGuard]` (parent); child routes have no guards | Children inherit; OK |
| `/clientes-gdpr` | `[AuthGuard, OwnerAdminGuard, MfaStepUpGuard]` | Strong |
| `/gdpr` | `[AuthGuard, OwnerAdminGuard, MfaStepUpGuard]` | Strong |
| `/tickets` | `[AuthGuard, ModuleGuard]` | Strong |
| `/tickets/:id` | `[AuthGuard]` | **Weak (H-6)** |
| `/productos` | `[AuthGuard, OwnerAdminGuard, ModuleGuard]` | Strong |
| `/servicios` | `[AuthGuard, OwnerAdminGuard, ModuleGuard]` | Strong |
| `/dispositivos` | `[AuthGuard, ModuleGuard]` | Strong |
| `/chat` | `[AuthGuard, ModuleGuard]` | Strong |
| `/docs` | `[StaffGuard]` | Strong |
| `/ayuda` | (redirect to `/docs`) | OK |
| `/notifications` | `[AuthGuard]` | Weak (H-6) |
| `/analytics` | `[AuthGuard, ModuleGuard]` | Strong |
| `/facturacion` | `[StaffGuard]` | Strong |
| `/facturacion/series` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/facturacion/:id` | `[StaffGuard]` | Strong |
| `/reservas` | `[AuthGuard, ModuleGuard]` | Strong |
| `/reservas/conciliacion` | `[AuthGuard, ModuleGuard]` | Strong |
| `/booking/:id` | `[AuthGuard]` | **Weak (H-6)** |
| **`/configuracion`** | **`[]`** | **None (C-1)** |
| `/configuracion/permisos` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/configuracion/estados` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/configuracion/unidades` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/configuracion/verifactu` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/configuracion/presupuestos` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/configuracion/presupuestos/notificaciones` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/configuracion/facturacion` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/configuracion/automatizaciones` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/configuracion/etiquetas` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/empresa` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/projects` | `[AuthGuard, ModuleGuard]` | Strong |
| `/admin/modulos` | `[AuthGuard, AdminGuard]` | Strong |
| `/admin/email-accounts` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/settings/inbound-mail` | `[AuthGuard, OwnerAdminGuard]` | Strong |
| `/admin/inbound-mail` | `[AuthGuard, AdminGuard]` | Strong |
| `/admin/system-health` | `[AuthGuard, SuperAdminGuard]` | Strong |
| `/admin/email-accounts/oauth-callback` | `[AuthGuard]` | **Weak (C-5, H-6)** |
| `/presupuestos` | `[AuthGuard, OwnerAdminGuard, ModuleGuard]` | Strong |
| `/waitlist` | `[AuthGuard, ModuleGuard]` | Strong |
| `/login` | `[GuestGuard]` | Strong |
| `/register` | (redirect to `/login`) | OK |
| **`/auth/callback`** | **None** | **None (C-4)** |
| **`/auth/confirm`** | **None** | **None (C-4)** |
| `/mfa-verify` | `[AuthGuard]` | OK (auth flow) |
| `/complete-profile` | `[AuthGuard, NotEmergencySuperAdminGuard]` | Strong |
| `/accept-dpa` | `[AuthGuard]` | OK (auth flow) |
| `/invite` | `[InviteTokenGuard]` | OK (L-1) |
| `/switching-company` | `[AuthGuard]` | OK (auth flow) |
| `/marketing/*` (4 routes) | `[AuthGuard, StaffGuard]` | Strong |
| `/privacy`, `/privacy/:companyId` | None | OK (public) |
| `/terms-of-service`, `/aviso-legal` | None | OK (public) |
| `**` | (redirect to `/inicio`) | OK with M-7 caveat |

---

## Appendix B: Recommended Fix Priority

| # | Finding | Severity | Effort | Files to change |
|---|---|---|---|---|
| 1 | C-1: empty guard on `/configuracion` | Critical | XS | `app.routes.ts` |
| 2 | C-3: MFA fail-open on network error | Critical | S | 4 guard files |
| 3 | C-2: 401 handler doesn't redirect | Critical | S | `http-error.interceptor.ts` |
| 4 | C-5: OAuth callback CSRF + role check | Critical | M | 2 files |
| 5 | C-4: `/auth/callback` state validation | Critical | M | `auth-callback.component.ts` |
| 6 | H-6: weak `AuthGuard`-only routes | High | XS | `app.routes.ts` |
| 7 | H-2: AAL cache 5min → 30s | High | XS | `auth.guard.ts` |
| 8 | H-3: profile cache hydration | High | M | `auth.service.ts` |
| 9 | H-7: MfaStepUpGuard sessionStorage | High | M | `mfa-stepup.guard.ts` + backend |
| 10 | H-1, H-4: client-side hiding + sidebar | High | M | multiple HTML + TS |
| 11 | M-2: super-admin bypass in callback | Medium | XS | `auth-callback.component.ts` |
| 12 | M-6: ModuleGuard visibility fail-open | Medium | S | `module.guard.ts` |
| 13 | M-1, M-3: misleading names | Medium | XS | rename files + refs |
| 14 | M-4: hardcoded professional check | Medium | M | `module.guard.ts` + config |
| 15 | L-1: InviteTokenGuard shape check | Low | XS | `invite-token.guard.ts` |

**Legend:** XS = < 30 min, S = 1-2h, M = 2-8h, L = 1-2 days.

---

**End of audit.**

# Rafter Perf Audit — Frontend (Angular / Supabase)
**Date:** 2026-06-22
**Scope:** `simplifica-crm/src/app/`
**Symptom:** 37,484 DB requests in a few hours; Disk IO Budget exhausted.

---

## Executive Summary

The frontend has **broad low-level caching but four "hot loop" patterns that multiply DB load linearly with user behavior**. A typical session currently issues roughly:

- ~25-40 `get_effective_modules()` RPCs (1 per component that calls `fetchEffectiveModules()`) — pure waste after first hydration.
- 1 `users` + 1 `clients` nested-embed query **per tab visibility resume** (`visibilitychange` handler re-hits `getSession()` and `setCurrentUser` re-queries).
- 1 `clients` query returning **up to 2000 rows + nested `clients_tags` join** every time `getCustomers()` is called without an explicit limit.
- 1 `bookings` query selecting ~30 columns + 3 nested relations for any caller that omits `filters.limit`.

Total `supabase.from(...)` invocations in app: **927**. In `services/`: **447**. In `services/` that are `select()`: **30**, of which **4** lack pagination/range/count.

There is **no N+1 in the literal sense** (`for (...) await this.supabase.from(...)`) — the code uses parallel fetches instead. But there is a near-equivalent: the analytics widget fires `getUsageBreakdown()` from BOTH its constructor effect AND its `ngOnInit`, with no `shareReplay`. And `quote-form.component.ts:890` issues `Promise.all(getServiceWithVariants(sid) ...)` — one query per item in the quote (real N+1 on save).

Top 5 highest-impact fixes (estimated DB calls saved per session):

1. **Drop the background re-fetch from `fetchEffectiveModules()`** — saves ~20 RPCs/session (see Finding 1).
2. **Stop calling `setCurrentUser()` on every `visibilitychange` resume** — saves ~2 nested-embed queries per tab return (Finding 2).
3. **Reduce default `getCustomers()` limit from 2000 to 50** — saves up to 39× row payload on customers list (Finding 3).
4. **Dedupe `ai-savings-widget` fetch path** — saves ~3 redundant queries per dashboard load (Finding 4).
5. **Convert `getCustomers` / `getBookings` results to `shareReplay(1)` Observables** — saves repeated refetches on every consumer subscribe (Finding 5).

---

## Findings

### Finding 1 — `SupabaseModulesService.fetchEffectiveModules()` re-fires RPC even when cached
- **File:line:** `F:/simplifica/simplifica-crm/src/app/services/supabase-modules.service.ts:109-121`
- **Pattern:** no-cache (cache-busting background refresh)
- **DB calls per session:** ~25-40 (one RPC per component that subscribes; 27 call sites found via grep, deduped only for concurrent calls within the same in-flight window)
- **Fix complexity:** small

```ts
// Current — line 113: ALWAYS fires a background RPC even when returning cached value
fetchEffectiveModules(): Observable<EffectiveModule[]> {
  const cached = this._modules();
  if (cached) {
    this._dedupedFetch().catch(() => {});   // <-- background refresh on EVERY call
    return of(cached);
  }
  ...
}
```

Call sites that fire this on every component mount: `mobile-bottom-nav.component.ts:811`, `responsive-sidebar.component.ts:845`, `dashboard-analytics.component.ts:858`, `ai-savings-widget.component.ts:55`, `invoice-detail.component.ts:664`, `invoice-list.component.ts:727`, `landing/home.component.ts:63`, `quote-form.component.ts:381`, `quote-list.component.ts:817`, `billing-settings.component.ts:104`, `configuracion.component.ts:1178`, `integrations.component.ts:150`, `module.guard.ts:56`, `analytics.service.ts:431`, plus auth.service.ts:814 pre-fetch.

**Recommended fix:** Remove the eager `_dedupedFetch()` after `of(cached)`. Move cache refresh to a single explicit trigger (timer in app init, or a tab-visibility refresh at most once per 60s). The 8s timeout race for first-paint is fine — keep that. Worst case: a new module entitlement takes 60s to reflect in UI, which is acceptable.

---

### Finding 2 — `visibilitychange` resume triggers `getSession()` AND full profile re-fetch
- **File:line:** `F:/simplifica/simplifica-crm/src/app/services/auth.service.ts:183-196` and `:697-712` (`handleAuthStateChange`)
- **Pattern:** no-cache + re-query on tab focus
- **DB calls per session:** ~2-4 nested-embed queries (`users` + `clients` with `company_members`, `companies`, `app_roles` joins) every time the user switches tabs back. Plus `professionals` read at line 1030.
- **Fix complexity:** medium

```ts
// auth.service.ts:183-196 — every tab-resume fires two auth calls + a profile refresh
this.visibilityChangeHandler = async () => {
  if (document.hidden) { ... }
  else {
    await this.supabase.auth.getSession();          // <-- call #1
    this.supabase.auth.startAutoRefresh();
    const { data } = await this.supabase.auth.getSession();  // <-- call #2
    ...
  }
};
```

The second `getSession()` is redundant. And while `handleAuthStateChange` is correctly guarded by `setCurrentUserPromise`, the `TOKEN_REFRESHED` event triggers it on every 50-min refresh — fine for that, but tab resume shouldn't ALSO trigger it (already a no-op if the session token hasn't rotated). The risk is also that `handleAuthStateChange` for `INITIAL_SESSION` runs `_doSetCurrentUser` which fires `_fetchCoreUserData` (Promise.all of `users` + `clients` with nested selects) and the fire-and-forget `professionals` query — every tab resume if session actually changes.

**Recommended fix:** On `visibilitychange` to visible, ONLY call `auth.getSession()` once, and skip `setCurrentUser` unless `event === 'SIGNED_IN'` or `event === 'TOKEN_REFRESHED'`. Don't reload the full profile tree on every focus — the cache (line 951-967 `waitForProfile`) already returns instantly. The fire-and-forget `from('professionals')` at line 1030 should also gate on a TTL (e.g. 5 min) to avoid the storm.

---

### Finding 3 — `getCustomers()` defaults to `.limit(2000)` returning a massive nested join
- **File:line:** `F:/simplifica/simplifica-crm/src/app/services/supabase-customers.service.ts:670-730` (line 708)
- **Pattern:** no-pagination + wide-join
- **DB calls per session:** 1 per `getCustomers()` call (typically 2-5 per session). Row payload can be 2000×N columns × nested `clients_tags(global_tags(...))` join.
- **Fix complexity:** small

```ts
// supabase-customers.service.ts:708
if (filters.limit) {
  query = query.limit(filters.limit);
  ...
} else {
  query = query.limit(2000);    // <-- swallows EVERYTHING in the company
}
```

Same in `getCustomersStandard` fallback at line 458: `q2.limit(200)`. The huge `select(...)` at line 434 (column list ~22 cols + tags join) is also run as fallback when the schema cache misses the embed.

**Recommended fix:** Change the default to a reasonable list-page size (50 or 100). Require callers who need full exports to pass `limit: 10000` explicitly. Add a separate `getAllCustomersForExport()` method so we don't conflate "load the list" with "build a CSV".

---

### Finding 4 — `AiSavingsWidgetComponent` fires the same fetches twice (constructor effect + ngOnInit)
- **File:line:** `F:/simplifica/simplifica-crm/src/app/features/analytics/ai-savings-widget/ai-savings-widget.component.ts:31-75`
- **Pattern:** loop (double-fire) + no-cache
- **DB calls per session:** Up to 5 redundant queries per dashboard load (4 from `getPotentialSavings`'s `Promise.all`, plus 1 from `getUsageBreakdown`'s `ai_usage_logs` scan).
- **Fix complexity:** small

```ts
// ai-savings-widget.component.ts:41-56
constructor() {
  effect(() => {
    const modules = this.modulesService.modulesSignal();
    if (modules) {
      const hasAi = modules.some((m) => m.key === 'ai' && m.enabled);
      this.fetchData(hasAi);     // <-- (A) fires queries
    }
  });
}

ngOnInit() {
  this.modulesService.fetchEffectiveModules().subscribe();  // <-- (B) may re-trigger (A)
}

fetchData(hasAi: boolean) {
  if (hasAi) {
    this.analyticsService.getUsageBreakdown().subscribe(...);    // SELECT on ai_usage_logs
  } else {
    this.analyticsService.getPotentialSavings().subscribe(...);   // 4 PARALLEL COUNT QUERIES
  }
}
```

`getUsageBreakdown` and `getPotentialSavings` are pure RxJS-from-promise Observables that re-execute on every subscribe. No `shareReplay`. Every dashboard mount = fresh query.

**Recommended fix:**
- Convert `getUsageBreakdown` and `getPotentialSavings` to cache by `(companyId, ttl)` — either via a per-key BehaviorSubject in `AiAnalyticsService` or via `shareReplay({ bufferSize: 1, refCount: true })` with a 60-300s TTL.
- Remove the duplicate `fetchEffectiveModules()` call in `ngOnInit` — the constructor effect already reads `modulesSignal()` which the parent `dashboard-analytics.component` hydrates. Or pass `[hasAi]` as an input from the parent.

---

### Finding 5 — No `shareReplay` on read-heavy Observables; `.asObservable()` returns live stream only
- **File:line:** multiple, full grep:
  - `supabase-customers.service.ts:52,56` — `customersSubject` BehaviorSubject + `.asObservable()` (no replay for late subscribers; relies on caller invoking `getCustomers` first).
  - `analytics.service.ts:417` `refreshAnalytics()` — Promise, not Observable, so no caching at all. Every call re-issues `Promise.all` of 7 RPCs.
  - `addresses.service.ts:19` — uses `from(...)` without `shareReplay`, so each subscribe re-fires.
  - `csrf.service.ts:113`, `localities.service.ts:40` — DO use `shareReplay(1)` correctly. Use these as templates.
- **Pattern:** no-cache
- **DB calls per session:** Hard to estimate — varies. The 37,484/hr number is consistent with this pattern firing on every route nav.
- **Fix complexity:** medium

**Recommended fix:** Add `shareReplay({ bufferSize: 1, refCount: true })` to the pipe of every `get*` Observable that returns the same answer across consumers (modules, addresses, localities, customer stats). For Promise-returning methods like `refreshAnalytics`, add an in-memory `Map<string, { ts, data }>` with TTL keyed by query params.

---

### Finding 6 — `quote-form.component.ts` N+1 on save: one `getServiceWithVariants` per item
- **File:line:** `F:/simplifica/simplifica-crm/src/app/features/quotes/quote-form/quote-form.component.ts:888-905`
- **Pattern:** N+1 (Promise.all of per-id fetches)
- **DB calls per user action:** 1 per line item in the quote (typically 1-10 per quote save)
- **Fix complexity:** small (add a `getServicesWithVariants(ids: string[])` batch method using `.in('id', ids)`)

```ts
// quote-form.component.ts:888-905 — N round-trips for N items
const loaded = await Promise.all(
  Array.from(serviceIds).map(async (sid) => {
    const s = await this.servicesService.getServiceWithVariants(sid);  // <-- per-item RPC
    return { id: s.id, ... };
  }),
);
```

**Recommended fix:** Add `getServicesWithVariantsByIds(ids: string[])` that does `.from('services').select('*, variants:service_variants(*)').in('id', ids)`. Drop-in replacement, single round-trip.

---

### Finding 7 — `analytics.service.refreshAnalytics()` Promise.all of 7 RPCs, no cache, fires on every refresh
- **File:line:** `F:/simplifica/simplifica-crm/src/app/services/analytics.service.ts:417-467` (line 450)
- **Pattern:** no-cache + heavy fan-out
- **DB calls per user action:** 7 RPCs per refresh (quote KPIs, all-draft quotes, recurring monthly, current pipeline, invoice KPIs, ticket KPIs, ticket status). On every nav back to dashboard.
- **Fix complexity:** medium

```ts
// analytics.service.ts:450
await Promise.all([
  this.loadQuoteKpisAndTrend(),     // 1 RPC
  this.loadAllDraftQuotes(),         // 1 RPC (table scan?)
  this.loadRecurringMonthly(),       // 1 RPC
  this.loadCurrentPipeline(),        // 1 RPC
  this.loadInvoiceKpisAndTrend(),    // 1 RPC
  this.loadTicketKpisAndTrend(),     // 1 RPC
  this.loadTicketCurrentStatus(),    // 1 RPC
]);
```

There's a concurrency guard at line 130 (`_refreshInProgress`), but it doesn't cache results — just prevents stacking. Re-clicking refresh re-fires all 7.

**Recommended fix:** Cache the result bundle by `(companyId, date-bucket)` for ~60s. Add a manual "force refresh" that bypasses cache.

---

### Finding 8 — Wide realtime channels: `public:clients`, `public:notifications`, `public:professionals`
- **File:line:**
  - `supabase-customers.service.ts:2858` — `public:clients` channel subscribed on the whole `clients` table (filtered by `company_id`)
  - `supabase-notifications.service.ts:187` — `public:notifications` per user
  - `supabase-professionals.service.ts:280` — `public:professionals` per company
  - `supabase-resources.service.ts:55` — `public:resources` per company
  - `supabase.service.ts:108` — generic `subscribe(table)` helper that subscribes to full table (no filter)
- **Pattern:** realtime-flood
- **DB calls per session:** Variable. Realtime WS messages don't hit Postgres on read, but the WS payloads themselves are server-side fanout per row. The bigger concern is the per-row handler at `projects.service.ts:1137-1149` which does `await this.supabase.from('project_activity').select(...).single()` for EVERY INSERT — a DB roundtrip per activity event.
- **Fix complexity:** small-medium

**Recommended fix:**
- Add `payload.new` to the realtime event if you have what you need; skip the enrichment `select` for events where the trigger row is already sufficient. If enrichment is needed, batch via `setTimeout`-coalescer (collect events for 500ms, then one SELECT WHERE id IN (...)).
- Generic `subscribe(table)` helper at `supabase.service.ts:108` is dangerous — requires callers to filter. Audit all callers.

---

### Finding 9 — `booking-settings.component.ts:2462` and `:2498` fetch with `.limit(500)` — large but bounded
- **File:line:** `F:/simplifica/simplifica-crm/src/app/features/settings/booking/booking-settings.component.ts:2462-2503`
- **Pattern:** large-page (mostly OK, but re-fires on every navigation)
- **DB calls per user action:** 2 per booking-settings load (filtered + all-company). Each returns up to 500 rows with embedded `service`, `professional`, `resource`.
- **Fix complexity:** small

**Recommended fix:** Cache the date-range bookings per (companyId, from, to) for ~30s. Booking settings is the most-frequently visited page in this app — every return issues these two queries.

---

### Finding 10 — `auth.service.ts` is **2,686 lines** with 14 explicit `auth.getSession()`/`getUser()` calls + 14 `from('users'|'companies'|'clients'|'professionals'|'pending_users'|'company_invitations')` reads
- **File:line:** `F:/simplifica/simplifica-crm/src/app/services/auth.service.ts`
- **Pattern:** Auth-call-fatigue + cross-service `auth.getSession()` everywhere
- **DB calls per session:** Hard to bound — each `getSession()` is local JWT-decoding (cheap), but `_doSetCurrentUser` runs the full profile rehydration on every sign-in or token refresh.
- **Fix complexity:** medium-large (refactor)

`auth.service.ts:439, 593, 710, 1458, 1889, 2033, 2142, 2423` — `getSession()` / `getUser()` calls scattered across the file. Many of these exist just to grab `session.access_token` for a fetch to an Edge Function (e.g. `ai.service.ts:36, 73`; `anychat.service.ts:99`). Consider a `getAccessToken(): Promise<string>` helper that caches the token in memory and only refreshes when `authService` signals token rotation.

**Recommended fix:** Memoize the access token in `AuthService` (refreshed only on `TOKEN_REFRESHED` event). Other services call `authService.getAccessToken()` instead of `supabase.auth.getSession()`.

---

## Realtime Channels Inventory (17 channels)

| File | Channel | Filter | Risk |
|---|---|---|---|
| `core/services/projects.service.ts:1126` | `project-activity-${id}` | `project_id=eq.X` | Per-event DB fetch (Finding 8) |
| `features/customers/profile/components/client-bookings/client-bookings.component.ts:477` | `client-bookings-${id}` | likely client_id | OK if filtered |
| `features/projects/projects/projects.component.ts:105,114` | `projects-realtime`, `tasks-realtime` | none stated | **Wide, check filter** |
| `features/settings/booking/booking-settings.component.ts:896` | (named) | TBD | high-traffic surface |
| `features/tickets/detail/ticket-detail.component.ts:984` | per-ticket | per-id | OK |
| `features/tickets/list/supabase-tickets.component.ts:201` | `tickets-changes` | TBD | check filter |
| `features/webmail/services/mail-store.service.ts:97` | `mail_messages:${accountId}` | per-account | OK |
| `services/client-portal.service.ts:80` | per-channel | TBD | OK |
| `services/supabase-customers.service.ts:2858` | `public:clients` | `company_id=eq.X` | Wide table (Finding 8) |
| `services/supabase-customers.service.ts:2893` | `public:client_assignments` | `professional_id=eq.X` | OK |
| `services/supabase-invoices.service.ts:104` | `verifactu-${invoiceId}` | per-id | OK |
| `services/supabase-notifications.service.ts:187` | `public:notifications` | per-user | OK |
| `services/supabase-professionals.service.ts:280` | `public:professionals` | `company_id=eq.X` | OK |
| `services/supabase-quotes.service.ts:171, 978` | per-channel | TBD | check |
| `services/supabase-resources.service.ts:55` | `public:resources` | `company_id=eq.X` | OK |
| `services/supabase.service.ts:108` | generic `public:${table}` | none | **UNFILTERED — DANGEROUS** |

**Action:** Audit `supabase.service.ts:106-111` `subscribe(table, callback)` callers immediately — this generic helper has no filter and will subscribe to the WHOLE table.

---

## Counts

- Total `.from(` in `src/app/`: **927**
- Total `.from(` in `src/app/services/`: **447**
- Total `.select(` in services: **30**
- Total `.select(` without `limit`/`range`/`count`/`.single`/`.maybeSingle` in services: **4**
- Total `.channel(` subscriptions: **17**
- Components with `ngOnInit` in `features/`: **159**
- `fetchEffectiveModules()` call sites: **27**
- `shareReplay` usages (whole app): **3** (csrf, localities, customers.loadCustomers only)
- Total services inspected for `auth.getSession()` / `auth.getUser()`: **20+**

---

## Top 5 Highest-Impact Frontend Fixes (sorted by DB calls saved per typical session)

1. **Drop the background re-fetch in `fetchEffectiveModules()`** — removes ~20 RPCs/session across the app. Cost: 1 line removed + add a 60s timer-based refresh trigger.
2. **Remove the `auth.getSession()` double-call and tab-resume profile re-hydration** — removes 2 nested-embed queries + 1 `professionals` query per tab return. Cost: gate `_doSetCurrentUser` on actual session token rotation, not visibility.
3. **Reduce `getCustomers()` default limit from 2000 to 50** — reduces row payload and PostgREST serialization work by up to 40× per call. Cost: 1 line change.
4. **Dedupe `ai-savings-widget` fetch path with `shareReplay` + remove duplicate `fetchEffectiveModules()` in `ngOnInit`** — removes ~3 redundant queries per dashboard load. Cost: refactor to RxJS `shareReplay({ bufferSize: 1, refCount: true, windowTime: 60_000 })`.
5. **Add a batch `getServicesWithVariantsByIds(ids[])` and use it in `quote-form.component.ts:888`** — removes N round-trips per quote save. Cost: 1 new service method, drop-in replacement.

Honorable mentions (lower per-call but high total):
- **Memoize access token** in `AuthService` (replaces ~14 `auth.getSession()` calls per session with 1 cached read).
- **Cache `refreshAnalytics()` result bundle** for ~60s in `AnalyticsService` (saves 7 RPCs per dashboard revisit).
- **Audit `supabase.service.ts:106` generic `subscribe()` callers** — unfiltered Realtime on a wide table is the worst-case amplification pattern.

---

## Risk Notes

- Findings 1, 2, 5, 10 touch core auth/cache flow. Recommend a feature flag (e.g. `environment.useStaleModules = true`) so you can roll out incrementally and revert without redeploying.
- Finding 3 changes a public service default — confirm no caller currently relies on `limit=2000` to get "all" (CSV export does — see Finding 3 fix recommendation: add `getAllCustomersForExport()`).
- Finding 8 (`projects.service.ts:1137` per-event SELECT) only matters if a project has heavy activity INSERTs; consider keeping the enrichment for chat-style live update and just adding a debounce.
- The audit grep was scoped to `src/app/` — Edge Functions (`api/`, `aws/`) and any background workers are out of scope. If 37k requests in a few hours comes from a cron-like source, the audit findings above will help but won't fully resolve.

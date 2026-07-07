# Plans and Modules — Architecture Guide

> **Audience:** developers extending the plan/add-on/grants layer or debugging
> "why doesn't this company see module X?" tickets. Read top-to-bottom on first
> contact; skim the table of contents after that.

## Overview

A module is a feature surface in the app (e.g. `moduloSAT`, `moduloChat`,
`moduloFacturas`, `core_/clientes`). The set of modules a **company** can
see is determined by a four-step union/diff evaluated server-side in
`public.get_effective_modules(company_id, user_id)`:

```
plan_includes   ∪   addons_includes   ∪   manual_grants   −   manual_revocations
```

That single RPC is the only thing the sidebar, the route guard, the mobile
nav, and every "module enabled?" check consult. There are **two** ways a
module becomes enabled: the company's plan includes it (or an add-on applies
to the plan), or a superadmin has explicitly gifted it. There is **one** way
it gets taken away: a superadmin revocation that survives plan changes
("sticky").

## Resolution chain

The SQL in `20260705000002_get_effective_modules_rewrite.sql`:

| Step | Source                                                                      | Effect      |
| ---- | --------------------------------------------------------------------------- | ----------- |
| 1    | `plan_module_access WHERE plan_id = companies.subscription_tier`            | `+ included` |
| 2    | `plan_addons WHERE is_active AND (applies_to_plans = {} OR contains tier)`  | `+ included` |
| 3    | `company_module_grants WHERE company_id = X AND status = 'active'`          | `+ included` |
| 4    | `company_module_grants WHERE company_id = X AND status = 'revoked'`         | `− excluded` |
| 5    | Caller is `super_admin` **and no `company_id` was passed**                  | `bypass → all catalog rows` |

Final result is joined against `modules_catalog` so labels come back too.

### Super-admin bypass

Step 5 means: when no `company_id` is given and the caller is `super_admin`,
the function returns the **entire catalog** so the admin UI shows every
possible module. Any other call without a `company_id` resolves to the
caller's primary company.

## Data model

### Tables created in `20260705000001`

```text
plan_module_access                          -- which modules each plan includes
  plan_id       text   → plans.id              (ON DELETE CASCADE)
  module_key    text   → modules_catalog.key   (ON DELETE CASCADE)
  created_at    timestamptz   DEFAULT now()
  PRIMARY KEY (plan_id, module_key)
```

```text
company_module_grants                       -- explicit per-company decision
  company_id  uuid    → companies.id    (ON DELETE CASCADE)
  module_key  text    → modules_catalog.key (ON DELETE CASCADE)
  status      text    -- 'active' | 'revoked'   CHECK (…)
  reason      text                       -- why the superadmin did this
  granted_by  uuid    → users.id
  created_at  timestamptz   DEFAULT now()
  updated_at  timestamptz   DEFAULT now()
  PRIMARY KEY (company_id, module_key)
```

```text
company_addon_grants                        -- giftable add-ons per company
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid()
  company_id                 uuid → companies.id   (ON DELETE CASCADE)
  addon_id                   text → plan_addons.id (ON DELETE CASCADE)
  status                     text -- 'active' | 'revoked'
  price_eur_cents_override   integer   -- NULL = use addon price, 0 = free
  reason                     text
  granted_by                 uuid → users.id
  starts_at                  timestamptz   DEFAULT now()
  ends_at                    timestamptz   -- NULL = no expiry
  created_at / updated_at    timestamptz
  UNIQUE (company_id, addon_id)
```

### Existing columns the chain depends on

```text
companies.subscription_tier   text NOT NULL → plans.id   (FK enforced)
plans.id                      text PK -- 'free' | 'starter' | 'pro' | 'business'
plan_addons.applies_to_plans  text[] -- empty = applies to all plans
plan_addons.included_modules  text[] -- module_keys granted by the addon
modules_catalog.key           text PK -- the single source of module identity
```

`companies.subscription_tier` is now a real FK with `NOT NULL`; the migration
promoted any NULL/unknown tier to `'free'` before applying the constraint.

### RLS (superadmin-only writes)

| Table                    | SELECT                            | INSERT/UPDATE/DELETE      |
| ------------------------ | --------------------------------- | ------------------------- |
| `plan_module_access`     | `authenticated` (true)            | `super_admin`             |
| `company_module_grants`  | — (read via RPC)                  | `super_admin`             |
| `company_addon_grants`   | — (read via RPC)                  | `super_admin`             |

The security model is "open read for plan memberships, gated everywhere
else". The sidebar reads through `get_effective_modules` (SECURITY DEFINER)
so grants tables don't need direct SELECT for the authenticated role.

## How the sidebar uses it

```
ResponsiveSidebar
└─ MenuVisibilityService.loadSidebarData()
   ├─ SupabaseModulesService.fetchSidebarOrder()   -- sort + visibility flags
   └─ SupabaseModulesService.fetchEffectiveModules()
        └─ .subscribe(mods ⇒ _allowedModuleKeys.set(new Set(mods.enabled.map(.key))))
```

The `visibleMenuItems` computed signal filters `ALL_NAV_ITEMS` with three
rules, in this order:

1. **`sidebar_navigation_order`** decides display order, master visibility,
   `visibleToClients` / `visibleToTeam`, and the DEV-mode flag.
2. **`isModuleEnabled(sidebarKey)`** is consulted for every non-core item; a
   `false` hides it from production users. Superadmins bypass this check.
3. **`SupabasePermissionsService.hasPermissionSync(...)`** for items that
   declare `requiredPermission` (e.g. `clients.view`).

While modules are loading (`_allowedModuleKeys() === null`) only **core**
items render — this is what stops the sidebar flashing items the user can't
actually access. The same `isModuleEnabled(key)` is consumed by
`ModuleGuard` (route-level), `MobileBottomNavComponent`, and
`module-aware.service` so the gate is consistent across every surface.

## How to manage from the admin UI

All under `/admin/modulos`:

| Tab              | Backed by                                  | What you do                                                                                                       |
| ---------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Empresas**     | `companies` + `company_module_grants` + `company_addon_grants` | Each company card has tier select, gift chips (modules), and a gift modal (module OR add-on, with optional price override). |
| **Planes y Precios** | `plans` + `plan_module_access`         | Per-plan toggle matrix: row = plan, column = module. Click a cell to toggle membership (writes one row at a time). |
| **Add-ons**      | `plan_addons`                              | Create / edit add-ons: id, name, icon, price, `applies_to_plans`, `included_modules`.                              |
| **Módulos**      | `modules_catalog`                          | Editable catalog: label, icon, `scope` (`core` / `production` / `dev`). Core modules are read-only in the plan matrix. |
| **Orden del Sidebar** | `sidebar_navigation_order`            | Custom order, per-role visibility, DEV-mode flag. Separate concern from plan membership.                          |

### Gift modal price preview

The Empresas-tab gift modal previews the price in five shapes (`giftAddonPricePreview`
in `modules-admin.component.ts`):

| Situation                                         | Preview                                                |
| ------------------------------------------------- | ------------------------------------------------------ |
| Add-on picked, no custom                          | "Precio normal: X €/mes"                               |
| Custom = 0                                        | "GRATIS" with original struck through                  |
| Custom == original                                | "Mismo precio que el catálogo"                         |
| Custom > original (or addon catalog is `0`)       | "Recargo: custom X vs Y original"                      |
| Custom < original (and > 0)                       | "Descuento del N %" with original → custom             |

## RPCs reference

All `admin_*` RPCs are `SECURITY DEFINER` and require `super_admin` (raise
`SQLSTATE 42501` otherwise). Calls without `super_admin` get a clean
Spanish toast in the UI.

### Public resolver

| Function                                                | Returns            | Purpose                                                                |
| ------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `get_effective_modules(p_input_company_id, p_auth_user_id)` | `TABLE(key, name, enabled)` | The one function everything reads. Runs the resolution chain above. |

### Plan ↔ module membership

| Function                                                                                | Purpose                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `admin_get_plan_module_access(p_plan_id text) → TABLE(module_key, included boolean)`     | Read per-plan matrix.                                         |
| `admin_set_plan_module_access(p_plan_id text, p_module_key text, p_included boolean)`   | Toggle one (plan, module) row.                                   |
| `admin_upsert_plan(..., p_module_keys text[])`                                            | Edit plan metadata + optional plan-wide module replace.       |

### Plan changes & resync

| Function                                                                       | Purpose                                                                                  |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `change_company_plan(p_company_id uuid, p_new_tier text)`                      | Move a company to a new plan; grants in `company_module_grants` get the new plan's modules added (sticky to revocations). |
| `admin_resync_company_to_plan(p_company_id, p_remove_orphan_grants boolean)`   | Bring grants back in sync with the current plan. Safe mode adds missing; destructive mode also removes orphans. |
| `sync_plan_grants_for_company(p_company_id, p_new_tier text)`                  | Internal helper called by `change_company_plan`.                                          |

### Manual module grants

| Function                                                                                                | Purpose                                                                 |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `admin_get_company_module_grants(p_company_id) → TABLE(..., granted_by_name)`                           | Read grants + history (granted_by_name comes from joining `users`).       |
| `admin_set_company_module_grant(p_company_id, p_module_key, p_status, p_reason)`                       | Upsert a grant. Status must be `active` or `revoked`. Use to gift or take away. |
| `admin_delete_company_module_grant(p_company_id, p_module_key)`                                        | Remove a grant entirely (delete the row, not just revoke).                |

### Add-on grants

| Function                                                                                                                                   | Purpose                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `admin_get_company_addon_grants(p_company_id) → TABLE(..., granted_by_name)`                                                                | Read add-on grants + price override + grantor name.                   |
| `admin_set_company_addon_grant(p_company_id, p_addon_id, p_status, p_price_eur_cents_override, p_reason, p_ends_at) → uuid` | Gift / replace an add-on grant. Returns the grant id. `price_override = NULL` uses catalog price; `0` is free. |
| `admin_delete_company_addon_grant(p_grant_id uuid)`                                                                                        | Remove a single add-on grant by id.                                    |

## Migration history

All migrations in the 2026-07-05 series. Each `NOTIFY pgrst, 'reload schema'`
fires at the end so PostgREST picks up the new shape immediately.

| File                                                            | Date       | What it did                                                                                                              |
| --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `20260705000001_plan_module_access.sql`                          | 2026-07-05 | Created `plan_module_access`, `company_module_grants`, `company_addon_grants`; backfilled `company_modules` → `company_module_grants`; promoted `companies.subscription_tier` to `NOT NULL` FK. |
| `20260705000002_get_effective_modules_rewrite.sql`                | 2026-07-05 | Replaced `get_effective_modules(text, uuid)` to run the union/diff above.                                                 |
| `20260705000003_admin_grants_rpcs.sql`                           | 2026-07-05 | First cut of all `admin_get_*` / `admin_set_*` / `admin_delete_*` RPCs for plans, module grants, and add-on grants.        |
| `20260705000004_change_company_plan_rpc.sql`                      | 2026-07-05 | `change_company_plan` + `sync_plan_grants_for_company`. Plan changes sync grants, sticky on revocations.                   |
| `20260705000005_resync_company_to_plan.sql`                      | 2026-07-05 | `admin_resync_company_to_plan(company_id, remove_orphan_grants)`. Safe (add-only) and destructive (prune) modes.            |
| `20260705000007_refactor_clinical_note_etc.sql`                   | 2026-07-05 | Rewrote `create_clinical_note`, `create_booking_clinical_note`, `generate_privacy_policy_html` to read from `company_module_grants`. |
| `20260705000008_admin_upsert_plan_refactor.sql`                   | 2026-07-05 | Refactored `admin_upsert_plan` to write metadata without touching the deprecated `plans.included_modules`, with optional `p_module_keys text[]` for atomic plan-wide replace. |
| `20260705000009_drop_legacy.sql`                                  | 2026-07-05 | Dropped `public.company_modules` table, `plans.included_modules` column, legacy `get_effective_modules(uuid, uuid)` overload, and the dead `admin_list_company_modules` / `admin_toggle_company_module` RPCs. |

> Note: the file `20260705000006` is intentionally absent — it was the
> holiday-weekend draft that was rolled back. `20260706000001_admin_grants_return_grantor_name.sql`
> is the post-merger improvement that adds the `granted_by_name` join for
> the gift-history tooltip.

## What's gone

| Removed                                                                | Replaced by                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `public.company_modules` table                                         | `public.company_module_grants` (one row per (company, module) with `status`) |
| `public.plans.included_modules` column                                 | `public.plan_module_access`                              |
| `public.get_effective_modules(uuid, uuid)` (old overload)              | `public.get_effective_modules(text, uuid)` (the new one) |
| `public.admin_list_company_modules(uuid)`                              | `public.admin_get_company_module_grants(uuid)`           |
| `public.admin_toggle_company_module(uuid, text, text)`                 | `public.admin_set_company_module_grant(uuid, text, status, reason)` |

Anything that read from `company_modules` was migrated to read from
`company_module_grants` in the 2026-07-05 series. New code MUST go through
the `get_effective_modules` RPC; do not read `plan_module_access` or
`company_module_grants` directly from the client.

## Quick recipes

**Gift a module to a company:**
```ts
modulesService.adminSetCompanyModuleGrant(companyId, 'moduloSAT', 'active', 'beta tester')
```

**Gift an add-on at 50 % off:**
```ts
modulesService.adminSetCompanyAddonGrant(companyId, 'ia', 'active', 1250, 'launch promo', null)
// price_eur_cents_override = 1250 → 12.50 € instead of catalog 25.00 €
```

**Force-include a module the plan doesn't cover (kept across plan changes):**
Insert a `company_module_grants` row with `status='active'`. Use the UI
gift modal — never write the table directly from the client.

**Take a plan-included module away from one company:**
```ts
modulesService.adminSetCompanyModuleGrant(companyId, 'moduloX', 'revoked', 'customer downgrade')
```
The revoke survives subsequent `change_company_plan` calls — that's the
"sticky" guarantee.

**Rebuild a company's grant list from scratch (destructive):**
Call `admin_resync_company_to_plan(companyId, true)` in SQL Editor. This
**deletes** every grant whose module isn't in the current plan, including
manually-gifted ones — use deliberately.

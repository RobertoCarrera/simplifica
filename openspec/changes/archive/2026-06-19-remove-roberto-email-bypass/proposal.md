# Proposal: Remove Roberto email-based bypass

## Why

Security review (Rafter v0.1, 2026-06-19) identified a **BLOCKER**: the
`AuthService.isRoberto()` method checks `userProfile.email === 'roberto@simplificacrm.es'`
**on the client side only**, and is consulted by **5 Angular guards**, 2
core guards, and 4 feature components. Anyone who can create a user with
that email in any tenant bypasses all authentication and role checks
(client-side), escalating to super-admin role. This is a privilege
escalation vector that survives even backend RLS because the Angular app
never reaches the API when the guard returns `true`.

## What changes

Replace the client-side email check with a backend-validated claim sourced
from Postgres. The infrastructure already exists:
`public.is_super_admin(uuid)` + `public.is_super_admin_real()` in
`20260414130000_security_audit_rpc_fixes.sql`. We will:

1. Stop granting super-admin role via email matching in `AuthService`.
2. Stop short-circuiting guard `canActivate()` based on email.
3. Surface `is_super_admin` from the JWT/session via Supabase claims or
   RLS-enforced column `app_users.is_super_admin` (already read by the
   frontend today — see `isRoberto` callers reading
   `userProfile.is_super_admin`).
4. Remove the 25+ hardcoded `isRoberto()` callsites; replace with a single
   helper that reads the backend-validated flag.
5. Keep a single, audit-logged `EMERGENCY` knob (env-gated, default OFF)
   to break-glass if the backend is unreachable. Never email-based.

## Scope

### Frontend (Angular)
- `src/app/services/auth.service.ts` — drop `isRoberto()` body and the two
  EMERGENCY BYPASS blocks; expose `isEmergencySuperAdmin` signal backed by
  backend flag.
- `src/app/guards/auth.guard.ts` — remove all 5 `isRoberto()` checks;
  trust `userProfile.is_super_admin` + AAL2.
- `src/app/core/guards/no-roberto.guard.ts` — refactor: rename to
  `not-emergency-guard.ts`, semantics inverted.
- `src/app/core/guards/staff.guard.ts` — remove `isRoberto()` branches.
- `src/app/features/admin/modules/modules-admin.component.ts` — drop the
  email check.
- `src/app/features/agenda/agenda.component.ts` — drop the email check.
- `src/app/features/calendar/calendar.component.ts` — drop the email check.
- `src/app/features/customers/supabase-customers/supabase-customers.component.ts`
  — drop the email check.
- `src/app/shared/layout/mobile-bottom-nav/mobile-bottom-nav.component.ts`
  — replace `ROBERTO_EMAIL` constant + `isRobertoDetected` with
  `isEmergencySuperAdmin` signal.

### Backend (Supabase / Postgres)

**NO MIGRATION NEEDED.** Verified via SQL:

- `public.users.is_super_admin` column does NOT exist. The actual
  super-admin source of truth is `public.users.app_role_id` joining to
  `public.app_roles.name = 'super_admin'`.
- The real super-admin (`roberto@simplificacrm.es`) ALREADY has
  `app_role_id` pointing to the super_admin role. Verified.
- `20260414130000_security_audit_rpc_fixes.sql` already provides the
  `is_super_admin(uuid)` SECURITY DEFINER function that validates via
  JOIN to `app_roles`. No changes needed.
- `isEmergencySuperAdmin()` in the frontend SHOULD use the same logic:
  read `userProfile.app_role.name === 'super_admin'` (or check
  `userProfile.is_super_admin` if the backend already maps that field
  to the role via Supabase view).

## Out of scope

- Reviewing all 6 SECURITY DEFINER functions in newer migrations (Warning
  W1 in security report) — separate change.
- Consolidating 6 self-healing quote trigger migrations (W2) — separate.

## Rollback plan

Revert commit. The change is purely defensive (remove a bypass); it cannot
break legitimate flows unless `users.is_super_admin` is unset for a real
super-admin. Mitigation: pre-flight SQL query to confirm at least one user
has `is_super_admin=true` before deploy.

## Affected modules

- `simplifica-crm/src/app/services/auth.service.ts`
- `simplifica-crm/src/app/guards/*`
- `simplifica-crm/src/app/core/guards/*`
- `simplifica-crm/src/app/features/admin/modules/*`
- `simplifica-crm/src/app/features/agenda/*`
- `simplifica-crm/src/app/features/calendar/*`
- `simplifica-crm/src/app/features/customers/supabase-customers/*`
- `simplifica-crm/src/app/shared/layout/mobile-bottom-nav/*`

## Estimated changed lines

~100-130 lines removed across 10 files. NO backend changes.

## Risk

- **HIGH if not migrated correctly**: a real super-admin whose flag is
  stored in `users.is_super_admin` keeps working. A super-admin whose
  only path was the email bypass gets locked out. Mitigated by
  pre-flight SQL check + admin-managed flag transition.

## Pre-flight check

```sql
-- Run before deploy: confirm at least one user has the super_admin app_role
SELECT u.email, ar.name FROM public.users u
JOIN public.app_roles ar ON u.app_role_id = ar.id
WHERE ar.name = 'super_admin';
-- Expect: at least 1 row, including roberto@simplificacrm.es
```

If zero, run this one-shot to set the role before deploying the frontend:

```sql
UPDATE public.users SET app_role_id = (
  SELECT id FROM public.app_roles WHERE name = 'super_admin'
) WHERE email = 'roberto@simplificacrm.es';
```
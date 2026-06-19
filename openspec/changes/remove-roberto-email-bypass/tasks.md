# Tasks: Remove Roberto email-based bypass

Total estimated changed lines: ~30 net removal. Single PR. Forecast
under 400-line review budget.

## Phase 1 — Infrastructure (Backend migration)

### Task 1.1 — Write migration

Write `supabase/migrations/20260619_remove_roberto_email_bypass.sql` per
the design doc. Pre-flight EXISTS check, idempotent UPDATE for real
Roberto, `ALTER TABLE users ADD COLUMN IF NOT EXISTS revoked_at`,
index, column comments.

- **Files**: `simplifica-crm/supabase/migrations/20260619_remove_roberto_email_bypass.sql` (new)
- **Estimated lines**: +35
- **Verification**: file is syntactically valid SQL; `psql --dry-run` or
  Supabase migration tooling reports no errors
- **Dependencies**: none

### Task 1.2 — Apply migration

Apply the migration to the Supabase project. Use the project's
`apply_migration` tool or `npx supabase db push` depending on the
environment.

- **Files**: `simplifica-crm/supabase/migrations/20260619_remove_roberto_email_bypass.sql`
- **Verification**:
  ```sql
  SELECT email, is_super_admin, revoked_at FROM public.users
  WHERE email = 'roberto@simplificacrm.es';
  -- Expect: is_super_admin = true, revoked_at = NULL
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users' AND column_name='revoked_at';
  -- Expect: 1 row
  ```
- **Dependencies**: 1.1

### Task 1.3 — Update TypeScript types

If the Supabase-generated `users` type does not yet include
`revoked_at`, regenerate types so the frontend can read it.

- **Files**: `simplifica-crm/src/app/services/supabase-db.types.ts` (regenerated)
- **Verification**: `tsc --noEmit` reports no missing-property errors on `userProfile.revoked_at`
- **Dependencies**: 1.2

## Phase 2 — AuthService

### Task 2.1 — Remove isRoberto and add isEmergencySuperAdmin

Edit `src/app/services/auth.service.ts`:
- Delete `isRoberto()` method (lines 1597-1600)
- Add `isEmergencySuperAdmin()` method that reads
  `userProfileSignal()?.is_super_admin` and `?.revoked_at`
- Delete the EMERGENCY BYPASS block at line ~2339
- Delete the EMERGENCY BYPASS block at line ~2406
- Delete the email check at line ~883
- Delete the email check at line ~914

- **Files**: `simplifica-crm/src/app/services/auth.service.ts`
- **Estimated lines**: -24, +6
- **Verification**:
  ```bash
  grep -n "isRoberto\|roberto@simplificacrm" src/app/services/auth.service.ts
  # Expect: empty
  grep -n "isEmergencySuperAdmin" src/app/services/auth.service.ts
  # Expect: at least 1 match (the method definition)
  ```
- **Dependencies**: none (can run in parallel with Phase 1)

### Task 2.2 — Unit test for isEmergencySuperAdmin

Add or extend `auth.service.spec.ts` to cover the new method with three
cases: true DB flag returns true, revoked DB flag returns false, missing
DB flag returns false.

- **Files**: `simplifica-crm/src/app/services/auth.service.spec.ts`
- **Verification**: `npm run test:unit -- --testPathPattern=auth.service` passes
- **Dependencies**: 2.1

## Phase 3 — Guards

### Task 3.1 — auth.guard.ts cleanup

Edit `src/app/guards/auth.guard.ts`: remove all 5 `isRoberto()` calls
and their bypass branches (lines 95, 182, 288, 353, 394). The 5 guards
continue to enforce role + AAL2 normally.

- **Files**: `simplifica-crm/src/app/guards/auth.guard.ts`
- **Estimated lines**: -25
- **Verification**: `grep -n "isRoberto\|ROBERTO\|roberto@" src/app/guards/auth.guard.ts` returns empty
- **Dependencies**: 2.1

### Task 3.2 — Rename no-roberto guard

Delete `src/app/core/guards/no-roberto.guard.ts`. Create
`src/app/core/guards/not-emergency-guard.ts` with inverted semantics:
block users where `auth.isEmergencySuperAdmin()` returns true. Update
imports across the codebase.

- **Files**:
  - `simplifica-crm/src/app/core/guards/no-roberto.guard.ts` (deleted)
  - `simplifica-crm/src/app/core/guards/not-emergency-guard.ts` (new)
  - all files importing the old guard (TBD via grep)
- **Estimated lines**: -20, +20
- **Verification**:
  ```bash
  ls src/app/core/guards/no-roberto.guard.ts  # Not found
  ls src/app/core/guards/not-emergency-guard.ts  # Found
  ```
- **Dependencies**: 2.1

### Task 3.3 — staff.guard.ts cleanup

Edit `src/app/core/guards/staff.guard.ts`: remove `isRoberto()` branches
at lines 33 and 55.

- **Files**: `simplifica-crm/src/app/core/guards/staff.guard.ts`
- **Estimated lines**: -6
- **Verification**: `grep -n "isRoberto" src/app/core/guards/staff.guard.ts` returns empty
- **Dependencies**: 2.1

## Phase 4 — Feature components

### Task 4.1 — admin/modules-admin

Edit `src/app/features/admin/modules/modules-admin.component.ts` line
~315: replace `this.auth.isRoberto()` with
`this.auth.isEmergencySuperAdmin()`.

- **Files**: `simplifica-crm/src/app/features/admin/modules/modules-admin.component.ts`
- **Estimated lines**: -2, +2
- **Verification**: `grep -n "isRoberto" src/app/features/admin/modules/modules-admin.component.ts` returns empty
- **Dependencies**: 2.1

### Task 4.2 — agenda

Edit `src/app/features/agenda/agenda.component.ts` line ~112: replace
`this.authService.isRoberto()` with
`this.authService.isEmergencySuperAdmin()`.

- **Files**: `simplifica-crm/src/app/features/agenda/agenda.component.ts`
- **Estimated lines**: -2, +2
- **Verification**: `grep -n "isRoberto" src/app/features/agenda/agenda.component.ts` returns empty
- **Dependencies**: 2.1

### Task 4.3 — calendar

Edit `src/app/features/calendar/calendar.component.ts` line ~818: same
swap.

- **Files**: `simplifica-crm/src/app/features/calendar/calendar.component.ts`
- **Estimated lines**: -2, +2
- **Verification**: `grep -n "isRoberto" src/app/features/calendar/calendar.component.ts` returns empty
- **Dependencies**: 2.1

### Task 4.4 — customers/supabase-customers

Edit `src/app/features/customers/supabase-customers/supabase-customers.component.ts`
line ~105: same swap in the `isSupervisor` computed.

- **Files**: `simplifica-crm/src/app/features/customers/supabase-customers/supabase-customers.component.ts`
- **Estimated lines**: -2, +2
- **Verification**: `grep -n "isRoberto" src/app/features/customers/supabase-customers/supabase-customers.component.ts` returns empty
- **Dependencies**: 2.1

## Phase 5 — Layout

### Task 5.1 — mobile-bottom-nav

Edit `src/app/shared/layout/mobile-bottom-nav/mobile-bottom-nav.component.ts`:
- Delete `ROBERTO_EMAIL` constant (line ~391)
- Rename `isRobertoDetected` computed to `isEmergencySuperAdmin` and
  source from `userProfile.is_super_admin`
- Remove the `console.warn('[MobileNav] ROBERTO BYPASS ...')` line
- Update the consuming `moreMenuItems` computed to use the new name

- **Files**: `simplifica-crm/src/app/shared/layout/mobile-bottom-nav/mobile-bottom-nav.component.ts`
- **Estimated lines**: -15, +10
- **Verification**:
  ```bash
  grep -in "roberto" src/app/shared/layout/mobile-bottom-nav/mobile-bottom-nav.component.ts
  # Expect: empty
  ```
- **Dependencies**: 2.1

## Phase 6 — Verification

### Task 6.1 — Global grep audit

Run a final scan to confirm no production code references the old
patterns.

- **Verification**:
  ```bash
  grep -rn "isRoberto\|roberto@simplificacrm" src/ --include="*.ts" \
    | grep -v ".spec.ts" \
    | grep -v "simple-supabase.service.ts"
  # Expect: empty
  ```
- **Dependencies**: 2.1, 3.1-3.3, 4.1-4.4, 5.1

### Task 6.2 — Lint and tests

Run lint and unit tests.

- **Verification**:
  ```bash
  cd F:/simplifica/simplifica-crm
  npm run lint  # Expect: 0 errors
  npm run test:unit  # Expect: all specs pass
  ```
- **Dependencies**: all prior

### Task 6.3 — Manual smoke

Document the manual smoke procedure in the PR description:
- Login as real Roberto (DB is_super_admin=true) → admin routes accessible
- Create test user with email roberto@simplificacrm.es but
  is_super_admin=false → admin routes blocked

- **Dependencies**: 6.1, 6.2

## Review Workload Forecast

- **Total tasks**: 13
- **Phases**: 6
- **Estimated lines changed**: ~75 added, ~104 removed = **~30 net removal**
- **Files touched**: 11 (10 modified, 1 new migration, 1 deleted/renamed)
- **400-line budget risk**: Low — well under budget
- **Chained PRs recommended**: No — single PR
- **Decision needed before apply**: No
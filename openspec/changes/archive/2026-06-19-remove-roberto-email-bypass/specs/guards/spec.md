# Delta for Guards: Remove Roberto email-based bypass

## MODIFIED Requirements

### Requirement: AuthGuard no Roberto bypass

`AuthGuard.canActivate` (in `src/app/guards/auth.guard.ts`) MUST NOT call
`authService.isRoberto()`. The early-return branch at line ~95 MUST be
deleted. Role enforcement MUST rely on `userProfile.is_super_admin` plus
the standard AAL2 / session checks already present.

(Previously: if `isRoberto()` returned true, the guard logged "ROBERTO
BYPASS" and returned `of(true)`, bypassing auth state checks entirely.)

#### Scenario: Real super-admin passes without bypass

- GIVEN an authenticated user with `is_super_admin = true`
- WHEN `AuthGuard.canActivate` is invoked for a protected route
- THEN the guard MUST evaluate normally using `currentUser$` and `userProfile$`
- AND the user MUST be granted access

#### Scenario: Bypass-attempt user is rejected

- GIVEN an authenticated user with email `roberto@simplificacrm.es` but `is_super_admin = false`
- WHEN `AuthGuard.canActivate` is invoked
- THEN the guard MUST NOT short-circuit to `true`
- AND the user MUST be redirected to `/login` (or treated as unauthenticated per normal flow)

#### Scenario: Source code is clean

- GIVEN `src/app/guards/auth.guard.ts`
- WHEN `grep -n "isRoberto\|ROBERTO" src/app/guards/auth.guard.ts` runs
- THEN the result MUST be empty

### Requirement: AdminGuard / StrictAdminGuard / SuperAdminGuard / OwnerAdminGuard no Roberto bypass

All four admin-flavored guards in `auth.guard.ts` MUST NOT call
`isRoberto()`. The bypass branches at lines ~182, ~288, ~353, ~394 MUST be
deleted. Role checks MUST rely on `profile.role` and
`profile.is_super_admin`.

#### Scenario: All admin guards clean

- GIVEN all five guards in `auth.guard.ts`
- WHEN `grep -n "isRoberto\|ROBERTO\|roberto@" src/app/guards/auth.guard.ts` runs
- THEN the result MUST be empty

#### Scenario: Role check works without bypass

- GIVEN a user with `profile.role = 'admin'` and `is_super_admin = false`
- WHEN `AdminGuard.canActivate` runs
- THEN the guard MUST pass (role check still works)
- AND no bypass logic MUST be evaluated

### Requirement: no-roberto guard renamed and inverted

`src/app/core/guards/no-roberto.guard.ts` MUST be renamed to
`not-emergency-guard.ts`. Its semantics MUST be inverted: instead of
blocking based on the old email bypass, it MUST block users whose
`isEmergencySuperAdmin()` returns true. The class name MUST be renamed
accordingly and any imports MUST be updated.

(Previously: `no-roberto.guard` blocked users where
`auth.isRoberto() === true`. Now: it blocks users where
`auth.isEmergencySuperAdmin() === true`.)

#### Scenario: New file exists, old file deleted

- GIVEN the rename
- WHEN `ls src/app/core/guards/` runs
- THEN `no-roberto.guard.ts` MUST NOT exist
- AND `not-emergency-guard.ts` MUST exist

### Requirement: staff.guard no Roberto branches

`src/app/core/guards/staff.guard.ts` MUST NOT include `isRoberto()`
branches. The bypass logic at lines ~33 and ~55 MUST be deleted. Role
checks MUST rely on `profile.role` and `profile.is_super_admin`.

#### Scenario: staff guard source clean

- GIVEN `src/app/core/guards/staff.guard.ts`
- WHEN `grep -n "isRoberto" src/app/core/guards/staff.guard.ts` runs
- THEN the result MUST be empty

## ADDED Requirements

### Requirement: All guards use backend-validated flag

Every guard in the codebase that previously called `isRoberto()` MUST
now read `auth.isEmergencySuperAdmin()` which is sourced from the
`users.is_super_admin` database column.

#### Scenario: No production code references isRoberto

- GIVEN the full `src/` tree
- WHEN `grep -rn "isRoberto" src/ --include="*.ts" | grep -v ".spec.ts"` runs
- THEN the result MUST be empty (test fixtures may still reference it for legacy coverage)
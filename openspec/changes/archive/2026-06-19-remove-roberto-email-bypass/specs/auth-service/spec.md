# Delta for AuthService: Remove Roberto email-based bypass

## MODIFIED Requirements

### Requirement: isRoberto method removed

The `AuthService.isRoberto()` method MUST be deleted. The hardcoded email
literal `'roberto@simplificacrm.es'` MUST NOT appear anywhere in this
file. Any caller that previously used `isRoberto()` to gate behavior
MUST be migrated to `isEmergencySuperAdmin()`, which reads the
backend-validated column `users.is_super_admin`.

(Previously: `isRoberto()` returned true when `userProfile.email ===
'roberto@simplificacrm.es'` or `currentUser.email === 'roberto@simplificacrm.es'`.)

#### Scenario: Method is gone

- GIVEN the AuthService source file
- WHEN `grep -n "isRoberto" src/app/services/auth.service.ts` runs
- THEN the result MUST be empty

#### Scenario: Hardcoded email is gone

- GIVEN the AuthService source file
- WHEN `grep -n "roberto@" src/app/services/auth.service.ts` runs
- THEN the result MUST be empty

### Requirement: isEmergencySuperAdmin method added

A new method `isEmergencySuperAdmin()` MUST be added to `AuthService`.
It MUST return `true` when `userProfileSignal()?.is_super_admin === true`
AND `userProfileSignal()?.revoked_at` is null. Otherwise it MUST return
`false`. It MUST NOT consult any email field.

#### Scenario: DB-backed super-admin returns true

- GIVEN a user with `users.is_super_admin = true` and `users.revoked_at IS NULL`
- WHEN `authService.isEmergencySuperAdmin()` is called
- THEN it MUST return `true`

#### Scenario: Revoked super-admin returns false

- GIVEN a user with `users.is_super_admin = true` and `users.revoked_at = '2026-06-19T10:00:00Z'`
- WHEN `authService.isEmergencySuperAdmin()` is called
- THEN it MUST return `false`

#### Scenario: Non super-admin returns false

- GIVEN a user with `users.is_super_admin = false` (or null)
- WHEN `authService.isEmergencySuperAdmin()` is called
- THEN it MUST return `false`

### Requirement: Emergency role promotion blocks removed

The two `EMERGENCY BYPASS` blocks in `AuthService` (around lines 2339 and
2406) that force `is_super_admin = true` based on the email match MUST be
deleted. The email check at lines 883 and 914 MUST be deleted. Role
promotion MUST come exclusively from the database column populated by an
existing super-admin.

#### Scenario: Email no longer grants super_admin

- GIVEN a newly created user with `auth.users.email = 'roberto@simplificacrm.es'`
  but `public.users.is_super_admin = false`
- WHEN the user logs in and the AuthService initializes
- THEN `authService.isEmergencySuperAdmin()` MUST return `false`
- AND the user MUST NOT have admin route access

## ADDED Requirements

### Requirement: revoked_at column support

`AuthService` MUST treat `userProfile.revoked_at` as a hard revocation
signal. When `revoked_at` is non-null, the user SHALL be treated as
non-super-admin regardless of `is_super_admin`. The session MUST still
load (no forced logout) but super-admin checks MUST fail.

#### Scenario: Revoked user keeps session but loses super-admin

- GIVEN an active session with `is_super_admin = true` and `revoked_at = now()`
- WHEN any guard calls `isEmergencySuperAdmin()`
- THEN the guard MUST NOT grant admin access
- AND the session MUST NOT be invalidated automatically
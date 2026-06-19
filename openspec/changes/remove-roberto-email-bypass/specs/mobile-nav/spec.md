# Delta for Mobile Nav: Remove Roberto email-based bypass

## MODIFIED Requirements

### Requirement: ROBERTO_EMAIL constant removed

`src/app/shared/layout/mobile-bottom-nav/mobile-bottom-nav.component.ts`
MUST NOT contain the constant `ROBERTO_EMAIL`. The hardcoded literal
`'roberto@simplificacrm.es'` MUST NOT appear in this file.

(Previously: line ~391 declared
`private static readonly ROBERTO_EMAIL = 'roberto@simplificacrm.es'`.)

#### Scenario: Source clean

- GIVEN the file
- WHEN `grep -n "ROBERTO_EMAIL\|roberto@" src/app/shared/layout/mobile-bottom-nav/mobile-bottom-nav.component.ts` runs
- THEN the result MUST be empty

### Requirement: isRobertoDetected replaced

The `isRobertoDetected` computed signal (around line ~485) MUST be renamed
to `isEmergencySuperAdmin` and MUST source its value from
`this.authService.userProfile?.is_super_admin` instead of an email check.

#### Scenario: Computed reads DB column

- GIVEN a user with `users.is_super_admin = true` and `users.revoked_at IS NULL`
- WHEN `isEmergencySuperAdmin()` is read
- THEN it MUST return `true`

#### Scenario: Computed ignores email

- GIVEN a user with email `roberto@simplificacrm.es` but `is_super_admin = false`
- WHEN `isEmergencySuperAdmin()` is read
- THEN it MUST return `false`

### Requirement: Debug log removed

The `console.warn('[MobileNav] ROBERTO BYPASS in moreMenuItems ...')` line
MUST be deleted. No log line in this file MAY contain the literal
`roberto@` (case-insensitive).

#### Scenario: No Roberto-related logs

- GIVEN the file
- WHEN `grep -in "roberto" src/app/shared/layout/mobile-bottom-nav/mobile-bottom-nav.component.ts` runs
- THEN the result MUST be empty

## ADDED Requirements

### Requirement: Menu items behave correctly

The `moreMenuItems` computed that previously returned "all items" for
Roberto MUST now return "all items" only when
`isEmergencySuperAdmin()` returns true.

#### Scenario: Real super-admin sees all menu items

- GIVEN a user with `users.is_super_admin = true`
- WHEN `moreMenuItems` is read
- THEN the result MUST include all admin menu items (parity with pre-change)

#### Scenario: Email-mimic user sees standard menu

- GIVEN a user with email `roberto@simplificacrm.es` but `is_super_admin = false`
- WHEN `moreMenuItems` is read
- THEN the result MUST NOT include admin-only menu items
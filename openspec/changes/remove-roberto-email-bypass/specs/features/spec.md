# Delta for Feature Components: Remove Roberto email-based bypass

## MODIFIED Requirements

### Requirement: modules-admin uses DB-backed flag

`src/app/features/admin/modules/modules-admin.component.ts` line ~315
MUST NOT call `this.auth.isRoberto()`. The role-check computed MUST use
`this.auth.userProfile?.is_super_admin` as the source of truth for the
super-admin branch.

#### Scenario: Real super-admin still passes

- GIVEN a user with `users.is_super_admin = true`
- WHEN the component computes admin visibility
- THEN the result MUST include super-admin permissions
- AND no email check MUST be evaluated

#### Scenario: Email-mimic user denied

- GIVEN a user with email `roberto@simplificacrm.es` but `is_super_admin = false`
- WHEN the component computes admin visibility
- THEN the result MUST NOT include super-admin permissions

#### Scenario: Source clean

- GIVEN the file
- WHEN `grep -n "isRoberto" src/app/features/admin/modules/modules-admin.component.ts` runs
- THEN the result MUST be empty

### Requirement: agenda component uses DB-backed flag

`src/app/features/agenda/agenda.component.ts` line ~112 MUST NOT call
`this.authService.isRoberto()`. The role-check MUST use
`this.authService.userProfile?.is_super_admin`.

### Requirement: calendar component uses DB-backed flag

`src/app/features/calendar/calendar.component.ts` line ~818 MUST NOT
call `this.authService.isRoberto()`. The role-check MUST use
`this.authService.userProfile?.is_super_admin`.

### Requirement: customers component uses DB-backed flag

`src/app/features/customers/supabase-customers/supabase-customers.component.ts`
line ~105 MUST NOT call `this.auth.isRoberto()`. The `isSupervisor`
computed MUST use `this.auth.userProfile?.is_super_admin` as the
super-admin source.

#### Scenario: All four feature files clean

- GIVEN the four feature files listed above
- WHEN `grep -rn "isRoberto" src/app/features/admin/modules/ src/app/features/agenda/ src/app/features/calendar/ src/app/features/customers/supabase-customers/` runs
- THEN the result MUST be empty

## ADDED Requirements

### Requirement: All feature components use isEmergencySuperAdmin

Each of the four feature components MUST, where they previously checked
`isRoberto()`, now check `isEmergencySuperAdmin()` for consistency with
the rest of the codebase.

#### Scenario: Behavior parity for real super-admins

- GIVEN a user with `users.is_super_admin = true` and `users.revoked_at IS NULL`
- WHEN the four components evaluate role checks
- THEN the visible behavior MUST be identical to the pre-change behavior for that user

#### Scenario: Behavior parity for non super-admins

- GIVEN a user with `users.is_super_admin = false`
- WHEN the four components evaluate role checks
- THEN the visible behavior MUST be identical to the pre-change behavior (no bypass granted)
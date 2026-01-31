# Security Report - February 2026

## Executive Summary
This report details the findings from the security audit of the Simplifica CRM repository. The audit focused on RLS policies, multi-tenancy architecture, and Edge Functions security. A critical vulnerability in `payment_integrations` RLS was identified, along with several high-priority issues regarding codebase integrity and legacy code regressions.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Description**: The RLS policies for the `payment_integrations` table check if the user has an 'admin' or 'owner' role via `app_roles` but fail to correlate the record's `company_id` with the user's `company_id`.
- **Impact**: Any user with an admin role in *any* company can view, modify, and delete payment integration credentials for *all* companies in the database.
- **Affected Files**: Defined in `supabase/migrations/20260111130000_remove_legacy_role_column.sql`.
- **Recommendation**: Immediate update of RLS policies to enforce `company_members` checks.

### 2. [HIGH] Broken Edge Function `payment-integrations-test`
- **Description**: The Edge Function queries the `role` column from the `users` table, which was dropped in migration `20260111130000`.
- **Impact**: The function will crash (500 Internal Server Error) for all invocations, preventing payment integration testing.
- **Affected Files**: `supabase/functions/payment-integrations-test/index.ts`.
- **Recommendation**: Refactor to query `company_members` for role validation.

### 3. [HIGH] Missing Critical RPC `verifactu_preflight_issue`
- **Description**: The `issue-invoice` Edge Function invokes a database function `verifactu_preflight_issue`, but this function is not present in any migration file in the repository.
- **Impact**: The repository does not reflect the deployed state of the database. Logic responsible for invoice chaining and hashing (critical for VeriFactu compliance) is un-auditable and cannot be restored if the database is reset.
- **Recommendation**: Locate the source code and add it to a migration immediately.

### 4. [HIGH] Permissive RLS in `item_tags`
- **Description**: The `item_tags` table allows any authenticated user to insert any tag for any record (`WITH CHECK (true)`).
- **Impact**: Malicious users can tag records belonging to other companies, causing data integrity issues or spam.
- **Affected Files**: `supabase/migrations/20260106110000_unified_tags_schema.sql`.
- **Recommendation**: Restrict insertion to users who have access to the referenced `record_id`.

### 5. [MEDIUM] Legacy `users.company_id` Dependency
- **Description**: Several RLS policies (e.g., `verifactu_settings`, `domains`) and Edge Functions still rely on `users.company_id`.
- **Impact**: Inconsistent with the new multi-tenant `company_members` architecture. Users belonging to multiple companies may be denied access to companies other than their "primary" one defined in `users.company_id`.
- **Recommendation**: Systematically migrate all company checks to use `company_members`.

## Action Plan
1. Fix `payment_integrations` RLS (Critical).
2. Fix `payment-integrations-test` Edge Function (High).
3. Investigate `item_tags` and `verifactu_preflight_issue` in subsequent updates.

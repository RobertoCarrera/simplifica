# Security Report - 2026-03-11

## Executive Summary
This audit has detected a **CRITICAL** regression in the codebase, likely due to a synchronization issue. Several security fixes previously applied in March 2026 are missing from the `supabase/migrations` directory.

## Findings

### 1. Critical RLS Regression in `payment_integrations`
*   **Severity:** CRITICAL
*   **Description:** The RLS policies for `payment_integrations` (defined in `20260111130000_remove_legacy_role_column.sql`) allow any authenticated user with an admin role (in *any* company) to access payment integrations of *all* companies. The policy `USING` clause checks the user's role but fails to filter by `company_id`.
*   **Impact:** Cross-tenant data leak of payment provider credentials (encrypted, but metadata is visible and write access might be possible).
*   **Remediation:** Enforce `company_id` check in RLS policies.

### 2. Critical RLS Vulnerability in `item_tags`
*   **Severity:** CRITICAL
*   **Description:** The `item_tags` table uses `TO authenticated USING (true)` policies.
*   **Impact:** Any authenticated user can read, create, update, or delete tags for any record (client, ticket, service) of any company, provided they guess the `record_id` (UUID).
*   **Remediation:** Add `company_id` column to `item_tags` (denormalization), backfill data, and enforce strict RLS.

### 3. IDOR / Auth Bypass in `verifactu-dispatcher`
*   **Severity:** HIGH
*   **Description:** The Edge Function exposes debug endpoints (`debug-test-update`, `debug-last-event`, `diag`) that accept a `company_id` in the body but do not verify if the caller belongs to that company.
*   **Impact:** An attacker can trigger VeriFactu updates or read event logs for other companies.
*   **Remediation:** Remove debug endpoints or strictly enforce `requireCompanyAccess`.

## Recommended Actions
1.  Apply a new migration `20260311000000_fix_critical_rls_regression.sql` to fix RLS.
2.  Update `verifactu-dispatcher` to remove debug logic.

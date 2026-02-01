# Security Report - 2026-03-01

**Status**: Critical Regression Detected
**Auditor**: Jules (Senior Security Engineer)

## Executive Summary
A critical regression has been detected in the codebase, reverting the state to approximately January 29, 2026. This reversion has reintroduced multiple critical vulnerabilities that were previously fixed in February 2026.

**Immediate actions required**: Re-apply RLS fixes and Edge Function security controls.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
*   **Location**: Database RLS Policies (Migration `20260111130000_remove_legacy_role_column.sql`)
*   **Issue**: The RLS policies for `payment_integrations` check if the user is an admin/owner but fail to check if the user belongs to the *same company* as the integration record.
*   **Impact**: Any admin from Company A can view, create, update, or delete payment integrations for Company B.
*   **Remediation**: Recreate policies to enforce `payment_integrations.company_id = users.company_id`.

### 2. [CRITICAL] Public Read/Write Access to `item_tags`
*   **Location**: Database RLS Policies (`item_tags` table)
*   **Issue**: The table lacks a `company_id` column and uses `TO authenticated USING (true)` policies.
*   **Impact**: Any authenticated user can read and modify tags for any record (clients, tickets) across all companies.
*   **Remediation**: Add `company_id`, backfill data, and restrict RLS to the user's company.

### 3. [HIGH] IDOR and Debug Backdoors in `verifactu-dispatcher`
*   **Location**: `supabase/functions/verifactu-dispatcher/index.ts`
*   **Issue**: The function exposes debug endpoints (`debug-test-update`, `debug-aeat-process`, etc.) that accept a `company_id` parameter without validating that the caller belongs to that company.
*   **Impact**: An attacker can manipulate VeriFactu events, reset attempts, or probe certificate status for any company.
*   **Remediation**: Remove debug endpoints and implement strict `requireCompanyAccess` checks for sensitive actions.

### 4. [MEDIUM] `verifactu_settings` Policy Review
*   **Location**: Database RLS Policies
*   **Issue**: While current policies in `20260111130000` appear to check `company_id`, the reversion puts this critical table at risk.
*   **Remediation**: Verify and reinforce policies during the RLS fix pass.

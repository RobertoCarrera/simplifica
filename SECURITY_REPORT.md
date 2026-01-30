# Security Audit Report - Simplifica

**Date:** February 2026
**Auditor:** Jules (Senior Security Engineer)

## Summary
This audit focused on RLS policies, Edge Functions, and Multi-tenancy isolation. Critical vulnerabilities were found in the `verifactu-dispatcher` Edge Function (IDOR) and High risks in RLS policies (`TO public`).

## Findings

### 1. [CRITICAL] IDOR in `verifactu-dispatcher` Debug Endpoints
*   **Description:** The `verifactu-dispatcher` function exposes debug and test endpoints (`debug-aeat-process`, `test-cert`, `debug-test-update`) that accept a `company_id` in the request body. The function executes these actions using a `service_role` client (`admin`) without verifying if the caller is a member of the specified company.
*   **Impact:** An attacker (authenticated or potentially unauthenticated if they guess the URL) could trigger AEAT processes, view certificate validation details, or modify event states for *any* company.
*   **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Remediation:**
    *   Remove `debug-env` endpoint (info leak).
    *   Implement `requireCompanyAccess(company_id)` middleware to validate the caller's membership via RLS before processing any request containing `company_id`.

### 2. [HIGH] RLS Policies using `TO public` on `company_members`
*   **Description:** The migration `20260111070000_fix_company_members_recursion.sql` applies policies to `company_members` using `TO public`. While the logic uses a secure function `current_user_is_admin`, explicitly allowing `public` (unauthenticated) access is a dangerous practice that relies entirely on the function returning false for null users.
*   **Impact:** If the helper function logic changes or has edge cases, unauthenticated users might gain access. It violates the "Secure by Default" principle.
*   **Affected Table:** `public.company_members`
*   **Remediation:** Change all `TO public` policies to `TO authenticated`.

### 3. [MEDIUM] `issue-invoice` Logic
*   **Description:** The `issue-invoice` function relies on RLS for initial checks but calls an RPC `verifactu_preflight_issue`.
*   **Impact:** Ensure the RPC also maintains strict ownership checks.
*   **Status:** Reviewed, appears safe due to initial RLS check, but worth monitoring.

## Planned Actions
1.  **PR 1 (Critical):** Fix IDOR in `verifactu-dispatcher` and remove insecure debug endpoints.
2.  **PR 2 (High):** Harden RLS policies for `company_members`.

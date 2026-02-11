# Security Audit Report - Simplifica CRM
**Date:** March 13, 2026
**Auditor:** Jules (AI Security Engineer)

## Executive Summary
A recurring security audit was performed on the Simplifica codebase. Two **CRITICAL** vulnerabilities were identified that require immediate remediation: one in the `verifactu-dispatcher` Edge Function (backdoor/debug endpoints) and one in the Database RLS layer (Cross-Tenant Data Leak in `payment_integrations`).

## Findings

### 1. [CRITICAL] Backdoor / Insecure Debug Endpoints in `verifactu-dispatcher`
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Issue:** The Edge Function contains several debug blocks (`debug-env`, `debug-test-update`, `debug-aeat-process`, `test-cert`) that are accessible to any caller who can invoke the function. These endpoints:
    *   Leak environment configuration (variables existence, timeout settings).
    *   Allow arbitrary modification of VeriFactu event states (resetting attempts, errors).
    *   Leak sensitive certificate information (existence, validity) and organizational data via `test-cert`.
    *   Perform full process simulations affecting production data.
    *   **Crucially**, these endpoints **do not perform any authorization checks** against the user's company or role. A user from Company A can query/modify events for Company B by simply guessing the `company_id`.
*   **Recommendation:** Remove all debug and test code blocks immediately.

### 2. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations` RLS
*   **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Active Policy)
*   **Issue:** The active RLS policy `payment_integrations_select` is defined as:
    ```sql
    USING (
      EXISTS (
        SELECT 1 FROM public.users u
        LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
        WHERE u.auth_user_id = auth.uid() AND ar.name IN ('owner', 'admin', 'super_admin')
      )
    )
    ```
    This policy checks if the user is an admin, but **fails to check if the `payment_integration` record belongs to the user's company**.
    *   **Impact:** Any 'admin' user of *any* company can `SELECT * FROM payment_integrations` and retrieve Stripe/PayPal access tokens for **all other companies** in the system.
*   **Recommendation:** Drop the policy and replace it with one that strictly enforces `company_id` matching via `public.company_members`.

### 3. [HIGH] Insecure `TO public` Policies on Sensitive Tables
*   **Location:** `verifactu_settings`, `verifactu_cert_history`
*   **Issue:** Policies are defined with `TO public`. While the `USING` clause currently relies on `auth.uid()` (which implicitly filters out unauthenticated users), this is fragile and violates the principle of least privilege.
*   **Recommendation:** Change all policies to `TO authenticated`.

### 4. [MEDIUM] `booking-manager` Function is a Stub
*   **Location:** `supabase/functions/booking-manager/index.ts`
*   **Issue:** The function contains stubbed methods (`createBooking` returns generic success without action).
*   **Impact:** False sense of functionality; potential data loss if users rely on it thinking bookings are being saved.

## Remediation Plan
1.  **Immediate Fix:** Remove debug code from `verifactu-dispatcher`.
2.  **Immediate Fix:** Deploy a new migration to fix `payment_integrations` and `verifactu_settings` RLS policies.

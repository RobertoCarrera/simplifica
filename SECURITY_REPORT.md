# Security Report - Simplifica CRM

**Date:** October 30, 2028
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
This report details the findings of the recurring security audit. The focus was on RLS, Edge Functions, and Financial Logic. Critical vulnerabilities were identified in the `aws-manager` Edge Function and the RLS policies for `verifactu_settings`.

## Findings

### 1. CRITICAL: Unsecured `aws-manager` Edge Function
*   **Location:** `supabase/functions/aws-manager/index.ts`
*   **Risk:** The function allows unauthenticated access to sensitive operations, specifically `register-domain`. Anyone with the function URL can register domains at the company's expense.
*   **Vulnerability:** Missing `supabase.auth.getUser()` check. The function accepts `action` and `payload` without verifying the caller's identity.
*   **Info Leak:** The function returns `details: error.stack` in error responses, exposing internal implementation details.
*   **Recommendation:** Implement Supabase Auth check using the `Authorization` header. Remove stack trace from responses.

### 2. HIGH: Risky RLS Policies on `verifactu_settings`
*   **Location:** `public.verifactu_settings` table (Migrations)
*   **Risk:** Policies are defined `TO public` instead of `TO authenticated`. While the `USING` clause filters by user, `TO public` is semantically incorrect for private data and could lead to accidental exposure if the logic is flawed or if guest access is introduced.
*   **Inconsistency:** The current policy checks `public.users.company_id`. Recent security hardening (e.g., invoices) relies on `public.company_members` table for active membership validation.
*   **Recommendation:** Change policies to `TO authenticated`. Update `USING` clause to check `public.company_members` for active status and company matching.

### 3. MEDIUM: Debug Endpoints in `verifactu-dispatcher`
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Risk:** The function exposes `debug-env`, `debug-last-event`, and `debug-test-update` actions.
*   **Impact:** `debug-env` exposes environment configuration (though sensitive keys seem masked/booleanized in some cases, it's still info leak).
*   **Recommendation:** Disable debug actions in production environment or restrict them to super-admins.

### 4. MEDIUM: Permissive CORS in `verifactu-dispatcher`
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Risk:** The `cors` function allows all origins if `ALLOW_ALL_ORIGINS` env var is set.
*   **Recommendation:** Ensure strict CORS configuration in production.

## Action Plan
1.  **Immediate Fix:** Secure `aws-manager` by adding authentication checks.
2.  **Hardening:** Update `verifactu_settings` RLS to use `TO authenticated` and `company_members` validation.

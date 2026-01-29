# Security Audit Report - Simplifica

**Date:** October 2028 (Simulated)
**Auditor:** Jules (AI Security Engineer)

## Executive Summary
This audit focused on RLS policies, Edge Functions, and financial logic. Critical vulnerabilities were found in `aws-manager` (unauthenticated access) and High severity issues in `verifactu-dispatcher` (IDOR, debug endpoints).

## Findings

### 1. Unauthenticated Remote Code Execution / Action in `aws-manager`
*   **Severity:** **CRITICAL**
*   **File:** `supabase/functions/aws-manager/index.ts`
*   **Description:** The function does not verify the Authorization header or the user's identity. Any user (or anonymous actor) can invoke this function to register domains (costing money) or check availability.
*   **Impact:** Financial loss, potential denial of service, resource exhaustion.
*   **Recommendation:** Implement `supabase.auth.getUser()` check immediately.

### 2. Insecure Debug Endpoints & IDOR in `verifactu-dispatcher`
*   **Severity:** **HIGH**
*   **File:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:**
    1.  The function exposes `debug-test-update`, `debug-env`, `debug-last-event`, and `diag` actions which leak internal environment variables (keys) and data, and allow modifying state without proper authorization.
    2.  The `retry` action allows any user with a valid JWT (even if not belonging to the company) to retry events for *any* invoice ID, leading to IDOR.
*   **Impact:** Data leakage (env vars), unauthorized state modification, potential abuse of retry logic.
*   **Recommendation:** Remove all debug endpoints. Use `requireInvoiceAccess` helper for the `retry` action.

### 3. Use of Deprecated `company_id` Column
*   **Severity:** **HIGH**
*   **File:** `supabase/migrations/20260129160000_finance_security_logic.sql` (RPC `convert_quote_to_invoice`), `supabase/functions/payment-integrations-test/index.ts`
*   **Description:** The code relies on `public.users.company_id` which is deprecated and nullable. New users might have this field as NULL, causing logic failures or potential bypasses if the code falls back to unsafe defaults (though currently it seems to mostly fail closed or check clients).
*   **Impact:** Service disruption for new users, potential future security gaps if logic changes.
*   **Recommendation:** Refactor to use `company_members` table for all company association checks.

### 4. RLS Policy Review
*   **Severity:** **MEDIUM**
*   **Files:** `supabase/migrations/*`
*   **Description:** Recent RLS policies (e.g., `20260107021500_update_rls_multi_tenancy.sql`) correctly use `company_members` for `companies` and `clients`. However, older policies or RPCs might still rely on the deprecated column.
*   **Recommendation:** Continue auditing all RPCs and policies to ensure `company_members` is used consistently.

## Next Steps
1.  **Immediate Fix:** Secure `aws-manager` by adding authentication checks.
2.  **Immediate Fix:** Hardening `verifactu-dispatcher` by removing debug code and fixing IDOR.
3.  **Follow-up:** Refactor `convert_quote_to_invoice` and `payment-integrations-test` to use `company_members`.

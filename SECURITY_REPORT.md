# Security Audit Report - Simplifica CRM

**Date:** May 25, 2026
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
This audit focused on RLS policies and Edge Functions. Critical vulnerabilities involving IDOR (Insecure Direct Object Reference) were found in the `verifactu-dispatcher` function, allowing unauthorized access to company certificates and debug operations. Additionally, RLS policies for `invoices` were found to be overly permissive, allowing any active employee to create or modify invoices regardless of their role.

## Findings

### 1. IDOR and Insecure Debug Endpoints in `verifactu-dispatcher` (CRITICAL)
*   **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:** The function exposes debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`) that accept a `company_id` in the request body and perform operations using a `service_role` client without validating the caller's permissions for that company.
*   **Impact:** Any authenticated user (or unauthenticated if the function is public) can trigger debug operations, potentially corrupting data or leaking sensitive environment info (like key lengths or partial config).
*   **Mitigation:** Remove all debug endpoints.

### 2. IDOR in `test-cert` Action (CRITICAL)
*   **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:** The `test-cert` action validates the encryption key but uses the `service_role` client to fetch company settings based solely on the `company_id` provided in the payload. It does not verify if the calling user belongs to that company.
*   **Impact:** An attacker could check if a company has a valid certificate configured or test connectivity for companies they do not own.
*   **Mitigation:** Implement strict authorization checks using `company_members` before processing the request.

### 3. Permissive RLS on `invoices` (HIGH)
*   **Affected File:** `supabase/migrations/20260129160000_finance_security_logic.sql` (and DB state)
*   **Description:** Current `INSERT` and `UPDATE` policies for `public.invoices` check for *active membership* in the company but do not enforce *roles* (e.g., 'owner', 'admin').
*   **Impact:** Any employee (e.g., a standard 'member' or 'agent') can create or modify invoices, which violates the principle of least privilege and could lead to financial data tampering.
*   **Mitigation:** Update RLS policies to explicitly require 'owner' or 'admin' roles.

### 4. Deprecated Column Usage in `list-registry` (MEDIUM)
*   **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:** The `list-registry` action queries `public.users.company_id`. This column is deprecated in favor of `public.company_members` for multi-tenancy support.
*   **Impact:** May break for users belonging to multiple companies or if the column is removed in the future.
*   **Mitigation:** Query `public.company_members` to resolve the user's company context.

### 5. Service Role Fallback in `invoices-pdf` (MEDIUM)
*   **Affected File:** `supabase/functions/invoices-pdf/index.ts`
*   **Description:** The function uses a `service_role` client to fetch invoice items if the user-scoped query returns few results.
*   **Impact:** Bypasses RLS. If RLS is correctly configured, this might expose items the user shouldn't see (though they already have access to the invoice). It masks potential RLS bugs.
*   **Mitigation:** Remove the fallback or investigate why RLS might be hiding items incorrectly. (Deferred to future sprint).

## Action Plan
1.  **Immediate Fix:** Secure `verifactu-dispatcher` by removing debug endpoints and implementing `requireCompanyAccess`.
2.  **Immediate Fix:** Harden `invoices` RLS policies to restricted roles.

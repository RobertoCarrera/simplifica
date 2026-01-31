# Security Audit Report - Feb 2026

## Executive Summary
This audit focused on Data Layer (RLS) and Edge Functions, identifying critical issues in multi-tenancy enforcement and IDOR vulnerabilities in debug endpoints.

## Findings

### 1. CRITICAL: Broken RLS Policies for Invoices & Quotes
*   **Severity:** CRITICAL
*   **Affected Files:** `supabase/migrations/20260107022000_update_rls_invoices_quotes.sql` (and active database state)
*   **Description:** The SELECT policies for `invoices` and `quotes` tables compare `company_members.user_id` (a public UUID referencing `public.users.id`) directly with `auth.uid()` (the Supabase Auth UUID).
*   **Impact:** Since these UUIDs are different, the condition `user_id = auth.uid()` always evaluates to FALSE. This results in a Denial of Service where legitimate users cannot view their own invoices or quotes.
*   **Remediation:** Update policies to use `public.get_my_public_id()` or a subquery mapping `auth.uid()` to `public.users.id`.

### 2. HIGH: IDOR Vulnerability in `verifactu-dispatcher` Debug Endpoints
*   **Severity:** HIGH
*   **Affected Files:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:** Several debug endpoints (`debug-aeat-process`, `test-cert`, `debug-last-event`) accept a `company_id` parameter in the request body and use the `service_role` client to fetch sensitive data (AEAT certificates, event logs) without verifying if the caller is a member of that company.
*   **Impact:** Any authenticated user (or anyone with the URL if `serve` logic permits) can retrieve sensitive tax information and configuration for any company by guessing the `company_id`.
*   **Remediation:** Implement a `requireCompanyAccess(company_id)` helper that uses the user's `Authorization` header to validate membership via RLS before processing the request.

### 3. HIGH: Legacy RPC `convert_quote_to_invoice`
*   **Severity:** HIGH
*   **Affected Files:** `supabase/migrations/20260129160000_finance_security_logic.sql`
*   **Description:** The function uses `public.users.company_id` to validate company ownership. This column is deprecated in favor of the `company_members` table for multi-tenancy.
*   **Impact:** Users belonging to multiple companies may be incorrectly denied access or granted access based on the wrong context.
*   **Remediation:** Refactor the RPC to check permissions against `company_members` using `public.get_my_public_id()`.

### 4. MEDIUM: `issue-invoice` Reliance on Broken RLS
*   **Severity:** MEDIUM
*   **Affected Files:** `supabase/functions/issue-invoice/index.ts`
*   **Description:** The function relies on `invoices` RLS to prevent IDOR. Since the RLS is currently broken (denies all), the function is non-operational for users. If the RLS were permissive, it would be vulnerable.
*   **Impact:** Functional breakage.
*   **Remediation:** Fix the underlying RLS policies (Finding #1).

## Next Steps
1.  **Immediate Fix:** Apply RLS corrections for `invoices` and `quotes`.
2.  **Immediate Fix:** Patch `verifactu-dispatcher` to enforce company access checks.

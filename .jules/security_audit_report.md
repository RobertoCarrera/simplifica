# Security Audit Report - Simplifica CRM

**Date:** 2026-01-30
**Auditor:** Jules (Senior Security Engineer)

## Summary
This audit focused on RLS policies, Edge Functions, and Financial Logic. Several critical and high-priority issues were identified, primarily related to the migration from single-tenant to multi-tenant architecture and deprecated column usage.

## Findings

### 1. [CRITICAL] `convert_quote_to_invoice` RPC Logic Flaws
*   **File:** `supabase/migrations/20260129160000_finance_security_logic.sql` (and underlying DB function)
*   **Description:**
    1.  The function authorizes users based on the deprecated `public.users.company_id` column instead of the new `public.company_members` table.
    2.  It hardcodes `tax_rate` to `0` when copying items from quotes to invoices, leading to financial data corruption and potential tax non-compliance.
*   **Impact:**
    *   **Security:** Users might be authorized incorrectly if their `users.company_id` is out of sync with `company_members`.
    *   **Financial:** Invoices generated from quotes will have 0% tax, causing incorrect totals and fiscal issues.

### 2. [HIGH] `upsert-client` Edge Function Uses Deprecated Auth Logic
*   **File:** `supabase/functions/upsert-client/index.ts`
*   **Description:** The function resolves the authenticated user's company by querying the deprecated `company_id` column on the `users` table.
*   **Impact:** If a user is removed from a company in `company_members` but the `users.company_id` column is not cleared (due to it being deprecated/legacy), they might still be able to create/update clients for that company. This is a potential IDOR/Privilege Escalation.

### 3. [HIGH] `verifactu-dispatcher` Edge Function Uses Deprecated Auth Logic
*   **File:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:** The `list-registry` action retrieves the user's company ID from the deprecated `public.users.company_id` column.
*   **Impact:** Similar to `upsert-client`, users might access VeriFactu logs for a company they no longer belong to.

### 4. [HIGH] Potential Service Role Key Exposure/Misuse in Edge Functions
*   **Description:** Multiple Edge Functions (`client-quotes`, `client-invoices`, `upsert-client`) use `SUPABASE_SERVICE_ROLE_KEY`. While `upsert-client` implements manual checks, any flaw in these checks (like finding #2) directly exposes the database to admin-level access.
*   **Recommendation:** Strictly audit all usages of `service_role_key` and prefer `auth.uid()` based RLS where possible, or use "User Impersonation" patterns if supported.

### 5. [MEDIUM] `issue-invoice` RPC Usage
*   **File:** `supabase/functions/issue-invoice/index.ts`
*   **Description:** Calls `verifactu_preflight_issue` RPC. This RPC should be audited to ensure it doesn't also rely on deprecated columns (not fully verified in this pass, but flagged for review).

## Remediation Plan (Immediate Actions)
1.  **Fix `upsert-client`:** Update the company resolution logic to strictly use `public.company_members` via the public user ID.
2.  **Fix `convert_quote_to_invoice`:** Deploy a new migration to replace this function with one that uses `company_members` for auth and correctly copies `tax_rate`.

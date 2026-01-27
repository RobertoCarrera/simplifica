# Security Audit Report - September 2027

## Summary
This audit identified critical regressions in the `verifactu-dispatcher` Edge Function and the RLS policies for financial tables. These vulnerabilities expose the system to IDOR attacks and unauthorized data access.

## Findings

### 1. CRITICAL: IDOR in `verifactu-dispatcher` (Debug/Test Endpoints)
*   **Description**: The debug and test endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) accept a `company_id` in the request body and perform actions using the `SUPABASE_SERVICE_ROLE_KEY` (admin client) without verifying that the authenticated user belongs to that company.
*   **Impact**: Any authenticated user can view events, certificate status, and potentially manipulate VeriFactu event states for any company in the system.
*   **Affected File**: `supabase/functions/verifactu-dispatcher/index.ts`
*   **Mitigation**: Implement strict authorization checks using a `requireCompanyAccess` helper that validates the user's membership in the target company before processing the request.

### 2. CRITICAL: RLS Logic Error in Invoices & Quotes (UUID Mismatch)
*   **Description**: The RLS policies for `invoices` and `quotes` created in Jan 2026 use `company_members.user_id = auth.uid()`. However, `public.users.id` (PK) is distinct from `auth.users.id` (`auth.uid()`).
*   **Impact**: Legitimate users may be denied access to their data (DoS), or if UUIDs accidentally collide, unauthorized access could occur. This represents a functional breakage of the multi-tenancy model.
*   **Affected Tables**: `public.invoices`, `public.quotes`
*   **Mitigation**: Update policies to map `auth.uid()` to `public.users.id` via `IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())`.

### 3. CRITICAL: Missing RLS on Child Tables
*   **Description**: Tables `invoice_items` and `quote_items` (and potentially `invoice_lines`) lack explicit RLS policies in the active migration set.
*   **Impact**: If RLS is enabled but no policies exist, data is inaccessible. If RLS is disabled, data is publicly readable. Given the regression history, it is safer to assume they are vulnerable.
*   **Affected Tables**: `invoice_items`, `quote_items`, `invoice_lines`
*   **Mitigation**: Explicitly enable RLS and add policies that inherit permissions from the parent `invoices`/`quotes` tables.

## Proposed Actions
1.  Patch `verifactu-dispatcher` to enforce `requireCompanyAccess`.
2.  Apply migration `20270901000000_fix_rls_security_critical.sql` to fix RLS policies.

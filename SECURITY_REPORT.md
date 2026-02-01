# Security Audit Report - Feb 24, 2026

## Executive Summary
This report details critical security vulnerabilities identified during the recurring audit of the Simplifica CRM repository. The codebase appears to have reverted to a state prior to Feb 2026, losing several critical security fixes. Immediate action is required to patch RLS policies and Edge Functions.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations` RLS
- **Severity**: Critical
- **Affected Component**: Database (RLS Policies)
- **File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (source of regression)
- **Description**: The RLS policies for `payment_integrations` (`select`, `insert`, `update`, `delete`) allow any user with an 'admin' or 'owner' role to access *all* records in the table, regardless of the `company_id`. The policies lack a check ensuring the user belongs to the same company as the integration record.
- **Impact**: An admin from Company A can view and modify payment credentials (API keys, secrets) of Company B.
- **Recommendation**: Update policies to strictly enforce `payment_integrations.company_id = user.company_id` (via `company_members` or `users` lookup).

### 2. [HIGH] IDOR in `verifactu-dispatcher` Debug Endpoints
- **Severity**: High
- **Affected Component**: Edge Function (`verifactu-dispatcher`)
- **File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: Several "debug" endpoints accept a `company_id` in the request body and return sensitive data (event logs, certificate status) without verifying that the authenticated user belongs to that company.
    - `debug-test-update`
    - `debug-last-event`
    - `debug-aeat-process`
    - `test-cert`
    - `diag` (returns global sample data)
    - `retry` (accepts `invoice_id` without checking ownership)
- **Impact**: Any authenticated user can access VeriFactu logs and certificate validation details of other companies by guessing or iterating `company_id` UUIDs. `diag` exposes data from arbitrary companies.
- **Recommendation**: Implement `requireCompanyAccess(company_id)` and `requireInvoiceAccess(invoice_id)` middlewares.

### 3. [HIGH] Missing RPC `verifactu_preflight_issue`
- **Severity**: High (Availability/integrity)
- **Affected Component**: Edge Function (`issue-invoice`) / Database
- **File**: `supabase/functions/issue-invoice/index.ts`
- **Description**: The `issue-invoice` function calls a database RPC `verifactu_preflight_issue`, which is missing from the current migration history (likely lost during reversion).
- **Impact**: Invoice issuance will fail with an internal server error.
- **Recommendation**: Restore the RPC definition.

### 4. [MEDIUM] `company_members` RLS Potential Mismatch
- **Severity**: Medium
- **Affected Component**: Database
- **Description**: Historical issues with `company_members` RLS using `auth.uid()` vs internal `user_id`. While the current policy looks partially correct, it requires verification to ensure no recursion or leaks exist.

## Action Plan
1. Apply immediate RLS fix for `payment_integrations`.
2. Secure `verifactu-dispatcher` endpoints.
3. Investigate and restore `verifactu_preflight_issue`.

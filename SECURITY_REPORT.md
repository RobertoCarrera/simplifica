# Security Audit Report - Simplifica CRM

**Date:** February 2026
**Auditor:** Jules (Senior Security Engineer)

## Summary
This audit focused on Edge Functions, RLS policies, and Financial logic. Critical vulnerabilities were found in `aws-manager` (Unauthenticated Access) and `verifactu-dispatcher` (Debug Endpoints/IDOR).

## Findings

### 1. [CRITICAL] Unauthenticated Access in `aws-manager`
- **File:** `supabase/functions/aws-manager/index.ts`
- **Description:** The function exposes `register-domain` and `check-availability` actions without any authentication check. Any user with the function URL can register domains at the company's expense.
- **Remediation:** Implement Supabase Auth (JWT) validation using `getUser()`.

### 2. [CRITICAL] Debug Endpoints & IDOR in `verifactu-dispatcher`
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function contains active debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`, `diag`) that allow bypassing logic and modifying state. Additionally, the `retry` action allows any user to retry events for any invoice (IDOR) without ownership checks.
- **Remediation:** Remove all debug endpoints. Implement `requireInvoiceAccess` for the `retry` action.

### 3. [HIGH] Deprecated Column Usage in Financial Logic
- **File:** `supabase/migrations/20260129160000_finance_security_logic.sql` (Function: `convert_quote_to_invoice`)
- **Description:** The function relies on `public.users.company_id`, which is deprecated and may be null/outdated. It should use `company_members`.
- **Remediation:** Update the function to join with `company_members` table.

## Action Plan
1. Fix `aws-manager` authentication immediately.
2. Remove debug endpoints from `verifactu-dispatcher` and fix IDOR.
3. Schedule fix for `convert_quote_to_invoice`.

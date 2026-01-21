# Security Audit Report - Simplifica CRM

**Date:** 2026-01-30
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
The audit focused on RLS policies, multi-tenancy enforcement, and Edge Functions security. Two significant findings were identified related to the recent migration to a many-to-many user-company relationship (`company_members`). Both the financial SQL logic and the VeriFactu dispatcher Edge Function rely on the deprecated `public.users.company_id` column, leading to potential denial of service or security bypasses for users in multiple companies or migrated users.

## Findings

### 1. [CRITICAL] Broken Multi-tenancy in Financial Logic
- **Component:** Database (RPC)
- **File:** `supabase/migrations/20260129160000_finance_security_logic.sql`
- **Function:** `convert_quote_to_invoice`
- **Issue:** The function attempts to determine the user's company by selecting `company_id` from `public.users`. This column was deprecated and made nullable in `20260107020000_create_company_members.sql`.
- **Impact:**
    - Users with NULL `company_id` (migrated users) will be treated as non-staff (falling through to Client check), causing valid operations to fail ("Usuario no autorizado").
    - If a user belongs to multiple companies, the logic fails to identify the correct context, potentially preventing invoice generation for legitimate quotes.
- **Recommendation:** Update the function to validate the user's membership in the quote's company via the `company_members` table.

### 2. [HIGH] Insecure Context Resolution in VeriFactu Dispatcher
- **Component:** Edge Function
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Action:** `list-registry`
- **Issue:** The `list-registry` action queries `public.users.company_id` to determine which company's registry to show.
- **Impact:**
    - Similar to the SQL issue, this breaks for users with NULL `company_id`.
    - Users belonging to multiple companies cannot specify which company registry they want to view (it defaults to the potentially stale or null column).
- **Recommendation:** Update the logic to accept an optional `company_id` parameter and validate it against `company_members`. If missing, infer from `company_members` (e.g., return first active company) or require the parameter.

### 3. [MEDIUM] Potential RLS Bypass in Edge Functions
- **Component:** Edge Function
- **File:** `supabase/functions/issue-invoice/index.ts`
- **Issue:** The function checks `invoices` access using a user-scoped client. While generally safe, if the underlying RPC `verifactu_preflight_issue` (definition not found in searched files) is `SECURITY DEFINER` and lacks internal checks, a race condition or direct RPC call might bypass checks.
- **Recommendation:** Ensure all `SECURITY DEFINER` functions re-validate ownership internally (as done in the proposed fix for `convert_quote_to_invoice`).

## Planned Remediations
1. **Fix SQL Logic:** Rewrite `convert_quote_to_invoice` to use `company_members`.
2. **Fix Edge Function:** Update `verifactu-dispatcher` to correctly resolve company context via `company_members`.

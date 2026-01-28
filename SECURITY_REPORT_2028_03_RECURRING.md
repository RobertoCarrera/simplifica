# Security Audit Report - March 2028 (Recurring)

## Executive Summary
This audit identified critical regressions in the `verifactu-dispatcher` Edge Function (IDOR, unprotected debug endpoints) and a fundamental flaw in the `company_members` RLS policies. Additionally, recent financial logic updates rely on deprecated database columns, creating potential availability and security risks.

## Findings

### 1. CRITICAL: IDOR and Unprotected Debug Endpoints in `verifactu-dispatcher`
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Risk:** The function exposes several debug actions (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `debug-env`) and `test-cert` that accept a `company_id` in the request body without verifying if the authenticated user belongs to that company.
- **Impact:** Any authenticated user (or potentially anonymous user if `SUPABASE_ANON_KEY` is leaked/used) can read events, test certificates, and modify event attempts for ANY company by guessing the `company_id`.
- **Recommendation:** Remove all debug endpoints immediately. Implement strict `requireCompanyAccess` checks for `test-cert` and other operational actions.

### 2. CRITICAL: Broken RLS Policy on `company_members`
- **File:** `supabase/migrations/20260107020000_create_company_members.sql` (and current DB state)
- **Risk:** The policy `Users can view own memberships` uses `user_id = auth.uid()`. Code analysis indicates `public.users.id` (UUID) is distinct from `auth.users.id` (`auth_user_id` column in `public.users`).
- **Impact:** Users likely cannot see their own memberships (false negative) or, if IDs coincidentally match, could see wrong data. This breaks the fundamental multi-tenancy resolution chain.
- **Recommendation:** Update the policy to resolve the user ID correctly: `user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())`.

### 3. HIGH: Reliance on Deprecated `company_id` Column
- **Files:** `supabase/functions/verifactu-dispatcher/index.ts`, `supabase/migrations/20260129160000_finance_security_logic.sql`
- **Risk:** The logic in `list-registry` (Edge Function) and `convert_quote_to_invoice` (RPC) queries `public.users.company_id`. This column was deprecated in favor of `company_members` and is nullable.
- **Impact:** Users correctly set up in `company_members` (but with null `public.users.company_id`) will be denied access to critical features (invoicing, registry listing).
- **Recommendation:** Refactor logic to query `company_members` via the `public.users` bridge.

### 4. HIGH: Unprotected Edge Function Trigger
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Risk:** The default execution path (polling pending events) runs if no `action` is provided. It has no authorization check (beyond CORS/Anon key).
- **Impact:** External actors can trigger the polling logic repeatedly, potentially causing DoS or interfering with the scheduled execution (race conditions).
- **Recommendation:** Require a specific Service Header or restricted role for the polling action.

## Action Plan
1. **PR 1 (Edge Functions):** Hardening `verifactu-dispatcher`. Remove debug endpoints, implement `requireCompanyAccess` correctly (resolving user->member), and fix `list-registry`.
2. **PR 2 (Database):** Fix `company_members` RLS and `convert_quote_to_invoice` RPC to correctly resolve `auth.uid()` to `company_members`.

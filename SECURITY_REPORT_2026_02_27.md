# SECURITY REPORT - 2026-02-27

## Summary
Recurrent audit of Simplifica CRM. Detected critical RLS vulnerabilities and High-risk IDOR in Edge Functions due to codebase reversion.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Policies: `payment_integrations_select`, `insert`, `update`, `delete`)
- **Risk:** The RLS policies allow any user with 'admin' or 'owner' role to access `payment_integrations` of **ALL** companies. The policies check the user's role but fail to filter by `company_id`.
- **Impact:** An attacker with a valid admin account in one company can view and modify payment credentials (PayPal/Stripe) of other companies.
- **Remediation:** Update policies to enforce `u.company_id = payment_integrations.company_id`.

### 2. [HIGH] IDOR in `verifactu-dispatcher` Debug Endpoints
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Risk:** Several debug actions (`debug-test-update`, `debug-aeat-process`, `debug-last-event`, `test-cert`) accept a `company_id` in the request body and use the `service_role` client to perform operations without verifying if the caller belongs to that company.
- **Impact:** Any authenticated user (or potentially unauthenticated if they guess the endpoint URL and the function doesn't enforce token presence strictly for these actions) can trigger AEAT processes, view events, or reset event states for any company.
- **Remediation:** Implement `requireCompanyAccess` to validate the caller's authorization token and company membership before processing these actions.

## Planned Fixes
1.  **Migration:** `20260227100000_fix_payment_integrations_rls.sql` to secure `payment_integrations`.
2.  **Edge Function Update:** Patch `verifactu-dispatcher` to strictly validate `company_id` access.

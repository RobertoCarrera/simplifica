# SECURITY AUDIT 2026-04

**Date:** 2026-04-10
**Auditor:** Jules (Senior Security Engineer)

## Summary
This audit focused on RLS policies and Edge Functions. Two critical vulnerabilities were identified: one in the data layer (RLS) allowing cross-tenant data access, and one in the Edge Function layer allowing unauthenticated execution of debug commands.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations` (RLS)
- **Risk:** High. Any user with an 'admin', 'owner', or 'super_admin' role in *any* company can view, insert, update, or delete `payment_integrations` records for *any other* company.
- **Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (source of vulnerability).
- **Description:** The policies `payment_integrations_select`, `insert`, `update`, and `delete` are defined `TO public` and check for the existence of *any* user record with an admin role matching `auth.uid()`. They fail to enforce that the user's `company_id` matches the `payment_integrations.company_id`.
- **Remediation:** Drop existing policies and recreate them with an additional `AND u.company_id = payment_integrations.company_id` clause (or equivalent logic).

### 2. [CRITICAL] Unauthenticated Debug Endpoints in `verifactu-dispatcher`
- **Risk:** High. Unauthenticated attackers can reset event statuses, corrupt event history, view sensitive environment configuration, and test certificate validity for any company.
- **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function exposes actions `debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`, and `test-cert` without validating the `Authorization` header. `test-cert` accepts a `company_id` from the body and performs operations using that company's credentials.
- **Remediation:** Remove debug endpoints entirely in production code. Secure `test-cert` by requiring a valid Bearer token and verifying the user belongs to the requested `company_id`.

## Planned Actions
1. Create migration `20260410000000_fix_payment_integrations_rls.sql` to fix RLS policies.
2. Patch `supabase/functions/verifactu-dispatcher/index.ts` to remove debug handlers and secure `test-cert`.

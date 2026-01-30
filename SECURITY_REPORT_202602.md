# Security Report - February 2026

## Executive Summary
This report details critical security vulnerabilities identified during the recurring audit of the "Simplifica" CRM. The most severe issues involve insecure direct object references (IDOR) in the `verifactu-dispatcher` edge function and permissive Row Level Security (RLS) policies that expose sensitive data across tenants.

## Findings

### 1. [CRITICAL] Exposed Debug Endpoints in `verifactu-dispatcher` (IDOR)
- **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The edge function exposes several debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) that accept a `company_id` parameter to perform actions or retrieve data. These endpoints do not validate if the authenticated user belongs to the specified company.
- **Impact:** Any authenticated user (or potentially anonymous if `SUPABASE_ANON_KEY` is known) can modify VeriFactu events, view invoice data, and trigger AEAT submissions for *any* company by guessing or enumerating `company_id`s.
- **Remediation:** Remove unnecessary debug endpoints in production. Implement strict authorization checks using the user's JWT to verify company membership before processing any company-specific action.

### 2. [CRITICAL] `payment_integrations` Data Leak (RLS)
- **Affected Table:** `public.payment_integrations`
- **Description:** The RLS policy `payment_integrations_select` allows any user with an 'admin' or 'owner' role to view *all* payment integrations, regardless of the company they belong to.
  ```sql
  CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
      WHERE u.auth_user_id = auth.uid() AND ar.name IN ('owner', 'admin', 'super_admin')
    )
  );
  ```
- **Impact:** An admin of Company A can view Stripe/PayPal credentials or configuration of Company B.
- **Remediation:** Add a check `AND u.company_id = payment_integrations.company_id` to the RLS policy.

### 3. [HIGH] Insecure Policy Definitions (`TO public`)
- **Affected Tables:** `public.verifactu_settings`, `public.payment_integrations`, `public.app_settings`
- **Description:** RLS policies are defined with `TO public`, allowing anonymous access attempts. While the `USING` clause often checks `auth.uid()`, this configuration is contrary to the defense-in-depth principle.
- **Impact:** Increases the attack surface. If a `USING` clause has a logic error (e.g., `auth.uid() IS NULL` handling), data could be exposed to unauthenticated users.
- **Remediation:** Change all sensitive policies to `TO authenticated`.

## Recommendations
1.  Immediately patch `verifactu-dispatcher` to remove or secure debug endpoints.
2.  Deploy a migration to fix RLS policies for `payment_integrations` and `verifactu_settings`.
3.  Conduct a broader review of all RLS policies to ensure `company_id` checks are consistent.

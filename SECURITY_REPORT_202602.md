# Security Audit Report - February 2026

## Executive Summary
This audit focused on Critical and High priority risks in the Data Layer (RLS) and Edge Functions. We identified significant vulnerabilities that could allow cross-tenant data access (IDOR) and information disclosure.

## Findings

### 1. Data Layer (RLS) - CRITICAL
**Affected Table:** `public.payment_integrations`
**Risk:** Data Leak / Multi-tenancy Breach
**Description:** The RLS policy `payment_integrations_select` (and others) grants access to any user with an 'admin' or 'owner' role *globally*, without checking if the user belongs to the specific company that owns the integration record. This allows an admin of "Company A" to view Stripe/PayPal keys of "Company B".
**Current Policy:**
```sql
USING ( EXISTS ( SELECT 1 FROM public.users u LEFT JOIN public.app_roles ar ... WHERE u.auth_user_id = auth.uid() AND ar.name IN ('admin', 'owner') ) )
```
**Recommendation:** Enforce a check against `public.company_members` to ensure the user is an admin *of the specific company*.

### 2. Edge Functions - CRITICAL
**Affected Function:** `verifactu-dispatcher`
**Risk:** IDOR / RCE-like behavior / Information Disclosure
**Description:**
- **Debug Endpoints:** The function exposes endpoints (`debug-aeat-process`, `debug-test-update`, `debug-last-event`) that accept a `company_id` in the body and perform sensitive actions (modifying data, sending to AEAT) without verifying that the caller has permissions for that `company_id`.
- **Information Disclosure:** The `debug-env` endpoint returns all environment variables (excluding keys, but including configuration) to any caller.
- **Service Role Abuse:** The function uses `SUPABASE_SERVICE_ROLE_KEY` for these debug actions without secondary authorization checks.

### 3. Data Layer (RLS) - HIGH
**Affected Table:** `public.verifactu_settings`
**Risk:** Policy Permissiveness
**Description:** Policies are defined as `TO public`. While they contain a `USING` clause that checks `auth.uid()`, this is unsafe practice. If the logic fails or is bypassed, unauthenticated users could access data.
**Recommendation:** Change policies to `TO authenticated`.

## Remediation Plan
1. **RLS Migration:** Deploy `20260201000000_fix_critical_rls.sql` to strictly scope `payment_integrations` and `verifactu_settings` to `company_members`.
2. **Edge Function Hardening:** Update `verifactu-dispatcher` to remove `debug-env` and implement mandatory `requireCompanyAccess()` checks for all administrative actions.

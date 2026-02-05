# Security Audit Report - Feb 2026 (Part 4)

## Executive Summary
This audit focused on RLS policies and Edge Function security. Two Critical/High vulnerabilities were identified: a cross-tenant data leak in `payment_integrations` and IDOR vulnerabilities in `verifactu-dispatcher` debug endpoints.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Description:** The RLS policies for `payment_integrations` allow any user with an 'owner' or 'admin' role (in *any* company) to view, insert, update, or delete payment integrations for *all* companies. The policy `EXISTS (SELECT 1 FROM public.users ... WHERE ar.name IN ('owner', ...))` checks global role status but fails to filter by `company_id`.
- **Impact:** An attacker with a valid admin account in their own company can dump Stripe/PayPal credentials of all other companies on the platform.
- **Remediation:** Update RLS policies to enforce `payment_integrations.company_id = users.company_id`.

### 2. [HIGH] IDOR in `verifactu-dispatcher` Debug Endpoints
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** Several debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) accept a `company_id` in the request body and perform administrative actions (resetting events, viewing certificates) using the `service_role` client without verifying that the caller belongs to that company.
- **Impact:** An attacker can disrupt tax reporting (reset events) or view sensitive certificate details of other companies.
- **Remediation:** Implement a `requireCompanyAccess(company_id)` check that verifies the caller's authorization against the requested `company_id`.

### 3. [MEDIUM] Broken Access Control in `app_settings`
- **File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Description:** RLS policies compare `users.id` (UUID) with `auth.uid()` (Auth UUID). These are distinct values in the system, meaning the policies will likely always evaluate to false for legitimate users, effectively denying access.
- **Impact:** Functionality relying on `app_settings` (e.g., global config) may be broken for admins.
- **Remediation:** Update policies to compare `users.auth_user_id` with `auth.uid()`.

## Planned Fixes
- **Migration:** `20260205120000_fix_security_audit_feb.sql` will patch RLS policies.
- **Edge Function:** `verifactu-dispatcher` will be patched to enforce company access control.

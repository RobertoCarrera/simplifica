# Security Audit Report - 2026-05-22

**Auditor:** Jules (Senior Security Engineer)
**Scope:** RLS, Edge Functions, Finance, Frontend
**Status:** In Progress

## Executive Summary
This audit identified **CRITICAL** vulnerabilities in the Data Layer (RLS) allowing cross-tenant data access, and **HIGH** risk vulnerabilities in Edge Functions exposing debug endpoints that could lead to Information Disclosure and IDOR.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in RLS Policies
**Risk:** High
**Impact:** Administrators of any company can access and modify sensitive data (payment credentials, domains) of ALL other companies.
**Description:**
RLS policies for `payment_integrations`, `domains`, and `scheduled_jobs` were created with broad `TO public` permissions or checked for "admin" role without verifying that the user belongs to the same company as the resource.
**Affected Files:**
- `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Source of the regression)
**Affected Tables:**
- `payment_integrations` (Contains Stripe/PayPal credentials)
- `domains` (Verified mail domains)
- `scheduled_jobs` (Background tasks)
**Mitigation:**
- Rewrite policies to enforce `u.company_id = resource.company_id`.
- For `domains` (which lacks `company_id`), enforce that the admin and the domain owner (`assigned_to_user`) share the same `company_id`.
- For `scheduled_jobs`, restrict to `service_role` until a clear multi-tenant ownership model is established.

### 2. [HIGH] Unsecured Debug Endpoints in Edge Functions
**Risk:** High
**Impact:** Information Disclosure (Env vars, keys), IDOR (Modify event status for any company), Data Leakage.
**Description:**
The `verifactu-dispatcher` function contains hardcoded debug actions (`debug-env`, `debug-test-update`, `debug-last-event`, `diag`) that accept a `company_id` in the payload without validating that the authenticated user belongs to that company.
**Affected Files:**
- `supabase/functions/verifactu-dispatcher/index.ts`
**Mitigation:**
- Remove all debug actions/backdoors.
- Ensure only strict business logic remains.

### 3. [MEDIUM] CORS Configuration
**Risk:** Low/Medium
**Description:** `verifactu-dispatcher` allows all origins if `ALLOW_ALL_ORIGINS` env var is set.
**Mitigation:** Ensure production environment variables are strict. (Out of scope for this immediate fix, focusing on code changes).

## Planned Remediation
1. **Migration:** `20260522000000_fix_critical_rls_leaks.sql` to patch RLS.
2. **Patch:** `verifactu-dispatcher` to remove debug code.

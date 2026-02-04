# Security Audit Report - April 2026

**Date:** 2026-04-14
**Auditor:** Jules (Senior Security Engineer)
**Scope:** RLS Policies, Edge Functions, Financial Logic

## Summary
This audit identified **2 Critical** and **1 High** severity vulnerabilities requiring immediate remediation. The most critical issues involve cross-tenant data leakage via permissive RLS policies and unauthenticated debug endpoints in the production Edge Functions.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in RLS Policies
**Affected Tables:** `payment_integrations`, `domains`, `scheduled_jobs`
**Risk:** Critical. Allows any authenticated user with an 'admin' role in *any* company to access and modify sensitive data (payment keys, domains, job schedules) of *all other companies*.
**Root Cause:** Migration `20260111130000_remove_legacy_role_column.sql` introduced policies that check for the 'admin' role but fail to verify that the resource belongs to the user's company (`company_id` check missing).
**Remediation:**
- Update RLS policies to enforce `company_id` match between the user (via `company_members` or `users` table) and the resource.
- For `scheduled_jobs`, restrict access strictly to `service_role` as it is an internal system queue.

### 2. [HIGH] Unauthenticated Debug Endpoints in `verifactu-dispatcher`
**Affected Component:** `supabase/functions/verifactu-dispatcher`
**Risk:** High. Exposes debug endpoints (`debug-test-update`, `debug-env`, `debug-aeat-process`) that allow:
- **IDOR/RCE:** Arbitrary modification of Verifactu event data via `service_role` client.
- **Information Disclosure:** Leakage of environment variables and configuration.
**Root Cause:** Debug code blocks were left in the production function and use the `SUPABASE_SERVICE_ROLE_KEY` without adequate authorization checks (relying only on `POST` method).
**Remediation:** Remove all debug logic blocks from the function code.

### 3. [MEDIUM] SSR/Auth Configuration
**Affected Component:** Angular SSR / Environment Config
**Observation:** Ensure no secrets are bundled in the client application. Review `environment.prod.ts` and `proxy.conf.json`. (To be addressed in subsequent sprints).

## Recommended Actions
1. Apply immediate hotfix migration for RLS policies.
2. Deploy patched `verifactu-dispatcher` function.

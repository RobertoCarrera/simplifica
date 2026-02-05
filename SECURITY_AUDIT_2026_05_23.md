# Security Audit Report - 2026-05-23

## Executive Summary
This audit identified **Critical** vulnerabilities in the Data Layer (RLS) allowing cross-tenant data access, and **High** vulnerabilities in Edge Functions allowing IDOR and Information Disclosure via exposed debug endpoints.

## Findings

### 1. RLS Cross-Tenant Data Leaks (CRITICAL)
**Affected Tables:** `payment_integrations`, `domains`, `scheduled_jobs`
**Source:** Migration `20260111130000_remove_legacy_role_column.sql`

**Description:**
The RLS policies introduced in Jan 2026 grant access to users with `admin`, `owner`, or `super_admin` roles *without* verifying that the user belongs to the same company as the resource.
-   `payment_integrations`: Any admin can list/modify integrations of *any* company.
-   `domains`: Any admin can manage *all* domains globally.
-   `scheduled_jobs`: Accessible to any admin globally.

**Risk:**
-   **Confidentiality:** Exposure of sensitive payment credentials (API keys) and domain configurations.
-   **Integrity:** Malicious admins from one tenant could delete or modify integrations of another tenant.

**Recommendation:**
-   Update policies to enforce `company_id` equality between the user and the resource.
-   For `domains`, join `public.users` on `assigned_to_user` to resolve the target company.
-   Restrict `scheduled_jobs` to `service_role` only.

### 2. Edge Function Debug Backdoors & IDOR (HIGH)
**Affected Function:** `verifactu-dispatcher`

**Description:**
The function contains several hardcoded debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`, `diag`, `debug-aeat-process`) that bypass standard checks.
-   `debug-last-event`: Accepts `company_id` in the body and returns the last VeriFactu event for that company, bypassing RLS checks (uses `service_role` client).
-   `test-cert`: Accepts `company_id` in the body to test certificates but does not verify if the authenticated user belongs to that company.

**Risk:**
-   **Information Disclosure:** Attackers can retrieve sensitive tax submission events (events, errors, status) for any company by guessing `company_id`.
-   **IDOR:** Attackers can invoke certificate tests for other companies.

**Recommendation:**
-   Remove all `debug-*` and `diag` endpoints from production code.
-   Implement strict ownership checks for `test-cert` using the authenticated user's token.

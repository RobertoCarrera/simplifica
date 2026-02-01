# Security Report - Simplifica CRM
**Date:** 2026-02-25
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A security audit of the Simplifica codebase revealed **CRITICAL** vulnerabilities in the Data Layer (RLS) and **HIGH** severity issues in Edge Functions. The codebase appears to have suffered a regression to a state prior to January 2026 security fixes.

## Findings

### 1. Cross-Tenant Data Leak in Payment Integrations (CRITICAL)
*   **Affected Resource:** `public.payment_integrations` (PostgreSQL Table)
*   **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
*   **Description:** The RLS policies for this table (`payment_integrations_select`, etc.) are defined `TO public` and contain a logic flaw. They verify that the requesting user has an "admin" role in *some* company (via `auth.uid()`), but they **fail to enforce that the user belongs to the specific company owning the record**.
*   **Impact:** An admin of "Company A" can query, modify, or delete payment integration credentials (API keys, secrets) of "Company B", "Company C", etc.
*   **Remediation:** Drop current policies and implement strict RLS checking `company_members` for the specific `company_id`.

### 2. IDOR / Authorization Bypass in VeriFactu Dispatcher (HIGH)
*   **Affected Resource:** `verifactu-dispatcher` (Edge Function)
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:** The function exposes debug endpoints (`debug-last-event`, `debug-aeat-process`, `test-cert`) that accept a `company_id` in the request body. These endpoints use the `service_role` (admin) client to query sensitive data but **fail to verify if the caller is a member of that company**.
*   **Impact:** Any authenticated user (or anyone with a valid token) can dump tax event logs, AEAT responses, and test certificate configurations for any company by guessing the `company_id`.
*   **Remediation:** Implement a `requireCompanyAccess(company_id)` helper that validates the user's membership in the target company before proceeding.

### 3. Broken Access Control in Payment Tests (HIGH)
*   **Affected Resource:** `payment-integrations-test` (Edge Function)
*   **Location:** `supabase/functions/payment-integrations-test/index.ts`
*   **Description:** The function attempts to query `users.role` to verify admin status. This column was dropped in migration `20260111130000`.
*   **Impact:** The function currently throws a 500 error (Denial of Service). More critically, if the column existed but was unmaintained, it could lead to incorrect access decisions.
*   **Remediation:** Update the function to join `company_members` or `app_roles` to correctly verify permissions.

## Proposed Actions
1.  **Immediate:** Apply migration `20260225100000_fix_payment_security.sql` to lock down `payment_integrations`.
2.  **Immediate:** Patch `verifactu-dispatcher` to add `requireCompanyAccess` checks.
3.  **Immediate:** Patch `payment-integrations-test` to fix the schema reference.

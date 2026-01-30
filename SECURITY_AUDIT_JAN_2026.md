# Security Audit Report - Jan 2026

**Date:** January 2026
**Auditor:** Jules (Security Engineer)
**Scope:** RLS, Edge Functions, Financial Logic, Frontend Config.

## Summary

This audit identified **1 Critical** vulnerability involving cross-tenant data leakage in the `payment_integrations` table and **2 High** vulnerabilities related to Edge Function security and `verifactu_settings` RLS. Several Medium/Low issues were also noted.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
*   **Risk:** Critical
*   **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Policy definition)
*   **Description:** The RLS policies for `payment_integrations` allow any user with `admin`, `owner`, or `super_admin` role to access **ALL** payment integration records across **ALL** companies. The policies check the user's role but fail to filter by `company_id`.
*   **Impact:** An admin from Company A can view (and potentially modify or delete) Stripe/PayPal credentials of Company B. Although the frontend masks secrets, the raw API response includes all fields, potentially leaking encrypted secrets or webhook keys if not explicitly excluded in the select.
*   **Recommendation:** Update RLS policies to strictly enforce `company_id` matching between the user and the record.

### 2. [HIGH] IDOR & Info Disclosure in `verifactu-dispatcher`
*   **Risk:** High
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:**
    *   **Info Disclosure:** The `debug-env` action exposes internal environment variables (`VERIFACTU_MODE`, fallback settings, etc.) to anyone who can invoke the function.
    *   **IDOR/Privilege Escalation:** Debug actions like `debug-aeat-process`, `debug-last-event`, and `debug-test-update` accept a `company_id` parameter and perform administrative actions (resetting events, sending to AEAT) without verifying that the caller belongs to that company.
*   **Impact:** A malicious actor (or a curious user) could reset VeriFactu events, trigger false submissions to AEAT, or view event logs for other companies.
*   **Recommendation:** Remove `debug-env`. Wrap all company-specific debug actions in a permission check (e.g., `requireCompanyAccess`) that verifies the user's RLS access to the target company.

### 3. [HIGH] `verifactu_settings` Policies use `TO public`
*   **Risk:** High
*   **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
*   **Description:** The RLS policies for `verifactu_settings` are defined `TO public`. While they include `auth.uid()` checks, using `TO public` is less secure than `TO authenticated` as it relies entirely on the logic within the `USING` clause handling unauthenticated states correctly.
*   **Impact:** Increased attack surface. If `auth.uid()` behaves unexpectedly or the logic is flawed, unauthenticated users might gain access.
*   **Recommendation:** Change policies to `TO authenticated`.

### 4. [MEDIUM] `app_settings` Policies use `TO public`
*   **Risk:** Medium
*   **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
*   **Description:** Similar to above, `app_settings` allows access `TO public`. It restricts to admins, but should be `TO authenticated`.
*   **Recommendation:** Tighten to `TO authenticated`.

## Proposed Remediation Plan

1.  **PR 1:** Fix RLS for `payment_integrations` (Critical) and `verifactu_settings` (High).
2.  **PR 2:** Secure `verifactu-dispatcher` Edge Function (High).

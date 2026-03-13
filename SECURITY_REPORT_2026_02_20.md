# Security Audit Report - Feb 20, 2026

## Executive Summary
**CRITICAL ALERT:** A repository state reversion has occurred. Security patches applied in early February 2026 (RLS fixes, VeriFactu IDOR patches) are missing from the current codebase, which reflects a state from Jan 29, 2026. The application is currently vulnerable to issues previously identified and fixed.

## Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
- **Status:** Vulnerable (Reverted).
- **Description:** The RLS policies for `payment_integrations` (Select, Insert, Update, Delete) check if the user has an 'owner' or 'admin' role but **fail to verify that the user belongs to the same company** as the payment integration record.
- **Impact:** An admin of Company A can view, modify, or delete payment keys (Stripe/PayPal) of Company B, C, etc., simply by querying the table.
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (legacy state).

### 2. Broken Functionality in `payment-integrations-test` (HIGH)
- **Status:** Broken Code.
- **Description:** The Edge Function queries the `role` column from the `users` table: `.select("id, company_id, role, active")`.
- **Context:** The `role` column was dropped in migration `20260111130000`.
- **Impact:** The function will throw a database error (`column "role" does not exist`) whenever invoked, breaking the "Test Connection" feature in the UI.

### 3. IDOR in `verifactu-dispatcher` Debug Endpoints (HIGH)
- **Status:** Vulnerable.
- **Description:** The function exposes debug actions (`debug-test-update`, `debug-aeat-process`, `test-cert`) that accept a `company_id` in the POST body. The function uses a `service_role` client to execute these actions but **does not verify** that the caller (authenticated via Bearer token) is actually a member of the requested `company_id`.
- **Impact:** Any authenticated user (even a regular member of Company A) can trigger AEAT processes, reset event states, or view certificate statuses for Company B by guessing or knowing the `company_id`.

## Remediation Plan
1.  **Database:** Apply a new migration to enforce strict `company_id` checks on `payment_integrations` RLS policies.
2.  **Edge Functions:**
    - Refactor `payment-integrations-test` to use `app_roles` table for permission checks.
    - Implement `requireCompanyAccess` middleware in `verifactu-dispatcher` to secure debug endpoints.

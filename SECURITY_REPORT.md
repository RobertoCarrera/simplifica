# Security Audit Report - Simplifica CRM
**Date:** October 2028
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A recurrent security audit was performed on the Simplifica CRM codebase. Critical vulnerabilities were identified in the Data Layer (RLS) and Edge Functions, specifically regarding multi-tenant data isolation and unauthenticated function access. These findings indicate a regression to a previous insecure state (circa Jan 2026).

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations` (RLS)
*   **Description:** The RLS policies for the `payment_integrations` table check for user roles (`owner`, `admin`) but **fail to filter by `company_id`**.
*   **Impact:** Any user with an admin role in *any* company can SELECT/INSERT/UPDATE/DELETE payment integration credentials (Stripe/PayPal keys) for *ALL* companies on the platform.
*   **Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (defines current policies).
*   **Remediation:** Update RLS policies to enforce `payment_integrations.company_id` matches the user's membership via `company_members`.

### 2. [CRITICAL] Unauthenticated RCE in `aws-manager` Edge Function
*   **Description:** The `aws-manager` Edge Function executes actions (`check-availability`, `register-domain`) based on the request body without verifying the `Authorization` header or user identity.
*   **Impact:** Unauthenticated attackers can register domains (incurring costs) or check availability.
*   **Affected File:** `supabase/functions/aws-manager/index.ts`.
*   **Remediation:** Implement `supabase.auth.getUser()` verification at the start of the function handler.

### 3. [HIGH] Insecure Debug Endpoints & Authorization Bypass in `verifactu-dispatcher`
*   **Description:**
    1.  The function exposes debug endpoints (`debug-test-update`, `diag`, etc.) that leak environment variables and allow state modification without proper checks.
    2.  The `retry` action accepts an `invoice_id` and resets the event status **without checking if the caller has access to that invoice**.
*   **Impact:** IDOR vulnerability allowing attackers to interfere with VeriFactu event processing for other companies; Info disclosure of environment configuration.
*   **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`.
*   **Remediation:** Remove all debug endpoints. Implement `requireInvoiceAccess` check for the `retry` action.

### 4. [MEDIUM] RLS Logic Ambiguity (`auth.uid()` vs `public.users.id`)
*   **Description:** Some policies rely on `auth.uid()` mapping to `public.users.auth_user_id`, while `company_members` links to `public.users.id`. Inconsistent usage creates risk of broken access controls if the mapping isn't strictly enforced.
*   **Impact:** Potential for access denial or unauthorized access if UUIDs don't align as expected.
*   **Remediation:** Standardize RLS to always bridge `auth.uid()` -> `public.users.id` before checking `company_members`.

## Next Steps
Immediate remediation actions are planned for findings 1, 2, and 3.

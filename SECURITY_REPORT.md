# Security Audit Report - Simplifica CRM
Date: Feb 2026
Auditor: Jules (Senior Security Engineer)

## Executive Summary
A recurring security audit was performed on the `Simplifica` codebase. The audit focused on RLS policies, Edge Functions, and financial logic.
**Critical vulnerabilities** were identified in `aws-manager` (Unauthenticated Remote Code Execution) and `payment_integrations` (Data Leak Regression).
High-severity issues were found in `verifactu-dispatcher` (IDOR) and `create-payment-link` (Availability/Legacy Logic).

## Findings

### 1. [CRITICAL] Unauthenticated Domain Registration in `aws-manager`
*   **File:** `supabase/functions/aws-manager/index.ts`
*   **Description:** The Edge Function exposes `register-domain` and `check-availability` actions without any Authentication or Authorization checks. Any user (or bot) with the function URL can register domains on the company's AWS account, causing financial loss and potential reputation damage.
*   **Risk:** Critical (Financial Loss, Resource Hijacking).
*   **Status:** Pending Fix.

### 2. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations` (Regression)
*   **File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (and current schema)
*   **Description:** The RLS policy for `payment_integrations` uses a Global Role check (`users` joined with `app_roles`) but **fails to enforce** `company_id` scope.
    *   *Current Policy:* Checks if user is 'admin'/'owner' globally.
    *   *Vulnerability:* An Admin of Company A can view/modify Payment Integrations of Company B because the policy does not filter by `company_id`.
*   **Context:** This was previously fixed (per memory) but the codebase has reverted to a vulnerable state.
*   **Risk:** Critical (Data Leak, Credential Theft).
*   **Status:** Regression Detected.

### 3. [HIGH] IDOR in `verifactu-dispatcher` Debug Endpoints
*   **File:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:** Debug actions (`debug-test-update`, `debug-aeat-process`, `test-cert`) accept a `company_id` parameter but do not verify if the caller is a member of that company.
*   **Risk:** High (Unauthorized Access to Sensitive Tax Data/Certificates).
*   **Status:** Pending Fix.

### 4. [HIGH] Broken Payment Link Generation (`create-payment-link`)
*   **File:** `supabase/functions/create-payment-link/index.ts`
*   **Description:**
    1.  **Availability:** The function queries `role` from `users` table, which was dropped in migration `20260111130000`. This causes the function to crash (500 Error).
    2.  **Multi-tenancy:** It relies on `users.company_id` (legacy single-tenant column) instead of checking `company_members` membership.
*   **Risk:** High (DoS of Payment Feature, potential logical access issues).
*   **Status:** Pending Fix.

### 5. [MEDIUM] Legacy `users.company_id` usage in `convert_quote_to_invoice`
*   **File:** `supabase/migrations/20260129160000_finance_security_logic.sql`
*   **Description:** The RPC checks tenancy using `users.company_id`. While secure for single-tenant users, it restricts multi-tenant users (who might belong to multiple companies) to only one active company context, or might fail if `users.company_id` is null for pure multi-tenant users.
*   **Risk:** Medium (Functional limitation).
*   **Status:** Noted.

## Proposed Remediation Plan
1.  **Immediate Fix:** Secure `aws-manager` with Auth+RBAC.
2.  **Immediate Fix:** Fix IDOR in `verifactu-dispatcher` and restore `requireCompanyAccess`.
3.  **Immediate Fix:** Repair `create-payment-link` to work with current schema and enforce multi-tenancy.
4.  **Follow-up:** Apply RLS fix for `payment_integrations` (separate task/PR).

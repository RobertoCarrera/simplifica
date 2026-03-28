# Security Audit Report - Simplifica CRM

**Date:** March 2026
**Auditor:** Jules (Security Engineer)

## Executive Summary
A critical review of the `Simplifica` codebase has identified **Critical** vulnerabilities in the Data Layer (RLS) and **High** risks in Edge Functions. Immediate remediation is required to prevent cross-tenant data leaks and IDOR attacks.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
*   **Description:** The RLS policy `payment_integrations_select` (and others) created in `20260111130000` allows any user with `admin`/`owner` role to access `payment_integrations` rows of **ALL** companies. The policy checks the user's role but fails to filter by `company_id`.
*   **Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (active in DB).
*   **Impact:** A malicious admin from Company A can view Stripe/PayPal credentials of Company B.
*   **Remediation:** Update policies to enforce `company_id` match between the user and the record.

### 2. [CRITICAL] Unrestricted Access to `item_tags`
*   **Description:** The `item_tags` table, used for tagging clients/tickets, has RLS policies set to `USING (true)` for all authenticated users.
*   **Affected File:** `supabase/migrations/20260106110000_unified_tags_schema.sql`.
*   **Impact:** Any authenticated user can read, create, or delete tags for any record in the system, crossing tenant boundaries.
*   **Remediation:** Add `company_id` column to `item_tags`, backfill data, and enforce RLS based on company.

### 3. [HIGH] IDOR in `verifactu-dispatcher` Edge Function
*   **Description:** Debug endpoints (`debug-aeat-process`, `test-cert`, etc.) in the `verifactu-dispatcher` function accept a `company_id` in the request body and perform actions using the `admin` (service role) client without verifying if the caller belongs to that company.
*   **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`.
*   **Impact:** An attacker can trigger AEAT processes, view certificate info (status), or modify event states for other companies.
*   **Remediation:** Implement `requireCompanyAccess()` helper to validate the user's token against the requested `company_id` using RLS-backed checks.

### 4. [MEDIUM] Missing `lint` script
*   **Description:** `package.json` lacks a `lint` script, hindering automated code quality and security checks.
*   **Impact:** Code quality degradation over time.

## Plan of Action
I will submit two Pull Requests to address the most critical issues:

1.  **PR #1 (Critical RLS Fixes):**
    *   Migrate `payment_integrations` policies to check `company_id`.
    *   Add `company_id` to `item_tags` and secure its RLS.
    *   **Manual Test:** Verify a user from Company A cannot see data from Company B.

2.  **PR #2 (Edge Function Security):**
    *   Secure `verifactu-dispatcher` endpoints with `requireCompanyAccess`.
    *   **Manual Test:** Verify that calling debug endpoints for a different company returns 401/403.

# Security Audit Report - April 2026

**Date:** 2026-04-10
**Auditor:** Jules (Senior Security Engineer)
**Scope:** RLS, Edge Functions, Financial Logic, Frontend/Auth

## Executive Summary

This audit identified **1 Critical** and **1 High** severity vulnerabilities that require immediate remediation. The critical issue involves a cross-tenant data leak in payment integrations, allowing administrators to view configurations of other companies. The high-severity issue involves an Edge Function exposing unauthenticated debug endpoints and potential IDOR vectors.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`

*   **Risk:** Critical
*   **Component:** Database (RLS)
*   **Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (and active database schema)
*   **Description:** The RLS policies for `payment_integrations` (SELECT, INSERT, UPDATE, DELETE) grant access to any user with an 'owner', 'admin', or 'super_admin' role, **without verifying that the user belongs to the same company** as the integration record.
*   **Impact:** A malicious or compromised admin account can list, modify, or delete payment integration credentials (API keys, secrets) for **all companies** in the system.
*   **Remediation:** Update RLS policies to enforce `payment_integrations.company_id = users.company_id`.

### 2. [HIGH] Unauthenticated Remote Code Execution / IDOR in `verifactu-dispatcher`

*   **Risk:** High
*   **Component:** Edge Functions
*   **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:** The function exposes several debug actions (`debug-test-update`, `debug-env`, `debug-aeat-process`) that execute administrative tasks without any authentication. Additionally, the `test-cert` action accepts a `company_id` in the request body without verifying if the caller has access to that company.
*   **Impact:**
    *   **Unauthenticated RCE:** Attackers can trigger AEAT submissions, reset event logs, or manipulate retry logic.
    *   **Information Disclosure:** `debug-env` exposes configuration variables.
    *   **IDOR:** Attackers can test/validate certificates for any company by guessing `company_id`.
*   **Remediation:** Remove debug endpoints entirely. Implement strict `Authorization` header validation for `test-cert` and derive `company_id` from the authenticated user's profile.

### 3. [MEDIUM] Review of `TO public` Policies

*   **Risk:** Medium
*   **Component:** Database (RLS)
*   **Description:** Several policies use `TO public` with complex `USING` clauses. While some correctly check `auth.uid()`, this pattern is error-prone.
*   **Remediation:** Systematically review all `TO public` policies and prefer `TO authenticated` where possible. Ensure all `TO public` policies have robust `auth.uid()` checks.

## Plan for Remediation

1.  **Immediate Fix:** Create a migration to patch `payment_integrations` RLS.
2.  **Immediate Fix:** Harden `verifactu-dispatcher` by removing debug code and adding auth checks.

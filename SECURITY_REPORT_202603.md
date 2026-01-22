# Security Audit Report - March 2026

**Date:** 2026-03-05
**Auditor:** Jules (Security Engineer)
**Status:** In Progress

## Executive Summary
A recurring security audit of the "Simplifica" CRM has identified **CRITICAL** vulnerabilities in Edge Functions and RLS policies. Immediate action is required to prevent unauthorized data access, IDOR attacks, and potential service abuse.

## Findings

### 1. Unauthenticated Access to `process-inbound-email` (CRITICAL)
*   **Location:** `supabase/functions/process-inbound-email/index.ts`
*   **Description:** The function creates a `ServiceRole` client and processes incoming emails without verifying the request source.
*   **Risk:** An attacker can inject arbitrary emails, flood the system, or spoof communications.
*   **Mitigation:** Enforce a `WEBHOOK_SECRET` check in headers.

### 2. Exposed Debug Endpoints & IDOR in `verifactu-dispatcher` (HIGH)
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:**
    *   Debug endpoints (`debug-test-update`, `debug-env`, `diag`) are exposed in production code.
    *   The `retry` action allows resetting VeriFactu events for *any* invoice ID without verifying user ownership (IDOR).
*   **Risk:** Information disclosure, database state manipulation, and unauthorized modification of financial event logs.
*   **Mitigation:** Remove debug endpoints. Enforce `requireInvoiceAccess` for the `retry` action.

### 3. Insecure RLS Policies on Sensitive Tables (CRITICAL)
*   **Location:** `payment_integrations`, `verifactu_settings` (Migration `20260111130000_remove_legacy_role_column.sql`)
*   **Description:** Policies are defined as `TO public` instead of `TO authenticated`. While `USING` clauses check `company_id`, `TO public` unnecessarily expands the attack surface.
*   **Risk:** Potential data leakage if `USING` logic has edge cases.
*   **Mitigation:** Change policies to `TO authenticated`.

### 4. Hardcoded Encryption Key Fallback (MEDIUM)
*   **Location:** `supabase/functions/payment-integrations-test/index.ts`
*   **Description:** Falls back to `default-dev-key-change-in-prod` if `ENCRYPTION_KEY` is missing.
*   **Risk:** If env var is misconfigured, data might be encrypted with a known key.
*   **Mitigation:** Remove fallback and throw error if key is missing.

## Planned Actions
1.  **Secure `process-inbound-email`**: Implement `WEBHOOK_SECRET` validation.
2.  **Harden `verifactu-dispatcher`**: Remove debug logic and fix IDOR in `retry`.
3.  **Fix RLS**: Submit migration `20260305120000_fix_critical_rls_public.sql`.
4.  **Secure `payment-integrations-test`**: Enforce environment variable presence.

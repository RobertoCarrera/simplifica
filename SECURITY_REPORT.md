# Security Report - Simplifica

**Date:** March 12, 2026
**Auditor:** Jules (Senior Security Engineer)

## Summary
A recurring security audit was performed on the `Simplifica` repository. Three (3) critical/high-impact vulnerabilities were identified, primarily affecting the Multi-tenancy (RLS) and Edge Functions layers.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
*   **Risk:** Critical
*   **Location:** Database (RLS Policies on `public.payment_integrations`)
*   **Impact:** Admin users of any company can view, modify, or delete payment integration credentials (API keys, secrets) of **ANY** other company.
*   **Root Cause:** The RLS policies created in `20260111130000_remove_legacy_role_column.sql` check if the user is an admin (`auth.uid()` matches a user with admin role) but **FAIL** to check if the user belongs to the same `company_id` as the integration record.
*   **Mitigation:** Update RLS policies to enforce `u.company_id = payment_integrations.company_id`.

### 2. [HIGH] IDOR / Privilege Escalation in `verifactu-dispatcher`
*   **Risk:** High
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Impact:** Unauthenticated or authenticated users can:
    *   Arbitrarily update `verifactu.events` table (modifying attempts, last error) via `debug-test-update`.
    *   Leak environment variables (configuration) via `debug-env`.
    *   Trigger AEAT processes for any company via `debug-aeat-process`.
*   **Root Cause:** Debug endpoints were left active in the production code and lack proper authorization checks (or any checks).
*   **Mitigation:** Remove all debug endpoints (`debug-test-update`, `debug-env`, `debug-aeat-process`, `diag`).

### 3. [HIGH] Fail-Open Authentication in `payment-webhook-paypal`
*   **Risk:** High
*   **Location:** `supabase/functions/payment-webhook-paypal/index.ts`
*   **Impact:** An attacker could bypass webhook signature verification by exploiting a logical flaw where the check is skipped if secrets are missing.
*   **Root Cause:** The code structure `if (secrets_exist) { verify() }` allows execution to proceed to payment processing if secrets are NOT found/configured, instead of failing closed.
*   **Mitigation:** Enforce "Fail Closed" logic. If secrets are required but missing, or if signature verification fails, return 401/500 immediately.

## Recommendations
Immediate remediation is required for all three findings. PRs will be created to address them.

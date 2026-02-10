# Security Audit Report - April 2026

**Date:** 2026-04-12
**Auditor:** Jules (Senior Security Engineer)
**Scope:** RLS, Edge Functions, Financial Logic, Frontend/Auth

## Executive Summary
This audit identified **3 Critical/High** vulnerabilities that require immediate remediation. The most severe issues involve a cross-tenant data leak in the payment integrations table and an unauthenticated IDOR in the VeriFactu dispatcher that allows unauthorized interaction with the Spanish Tax Agency (AEAT).

## Findings

### 1. Cross-Tenant Data Leak in Payment Integrations (CRITICAL)
*   **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Policies on `payment_integrations`).
*   **Description:** The RLS policies for `payment_integrations` check if the requesting user is an admin (`owner`, `admin`, `super_admin`) but **fail to verify that the user belongs to the same company** as the integration record.
*   **Impact:** Any admin of ANY company can view, edit, and delete payment integration credentials (API keys, secrets) of ALL other companies using the platform.
*   **Remediation:** Update RLS policies to enforce `u.company_id = payment_integrations.company_id`.

### 2. Unauthenticated IDOR & Tax Submission in VeriFactu Dispatcher (CRITICAL)
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:** The Edge Function exposes debug endpoints (`debug-aeat-process`, `debug-test-update`) that accept a `company_id` in the request body without verifying authentication or authorization.
*   **Impact:** An unauthenticated attacker can force the system to submit invoices to the Tax Agency (AEAT) on behalf of any company. The response also leaks internal process steps and configuration validity.
*   **Remediation:** Remove all debug endpoints from the production code.

### 3. Fail-Open Vulnerability in Stripe Webhook (HIGH)
*   **Location:** `supabase/functions/payment-webhook-stripe/index.ts`
*   **Description:** The webhook handler skips signature verification if the payment integration record is missing or if the webhook secret is not configured (`integration.webhook_secret_encrypted`). It then proceeds to process the payment based on the `payment_link_token`.
*   **Impact:** An attacker who discovers a valid `payment_link_token` can forge a webhook request to mark an invoice as paid without actual payment.
*   **Remediation:** Implement "Fail Closed" logic. If the signature cannot be verified (for any reason), reject the request.

## Action Plan
1.  **Immediate Fix:** Apply RLS patch for `payment_integrations`.
2.  **Immediate Fix:** Remove debug endpoints from `verifactu-dispatcher`.
3.  **Next Steps:** Patch `payment-webhook-stripe` to enforce signature verification.

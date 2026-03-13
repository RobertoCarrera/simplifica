# Security Audit Report - Simplifica CRM
**Date:** March 16, 2026
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A recurring security audit was performed on the Simplifica CRM codebase. Four (4) significant vulnerabilities were identified, ranging from Critical to High severity. These issues expose the system to cross-tenant data leaks, unauthorized access via debug endpoints, and potential webhook spoofing.

## Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
*   **Description:** The RLS policies for `payment_integrations` check if a user is an admin (`owner`, `admin`, `super_admin`) but fail to verify if the user belongs to the *same company* as the integration record.
*   **Impact:** Any admin from any company can query and view payment integration secrets (Stripe/PayPal keys) of all other companies on the platform.
*   **Affected Files:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (source of regression).
*   **Remediation:** Update RLS policies to enforce `u.company_id = payment_integrations.company_id`.

### 2. Unrestricted Access to `item_tags` (CRITICAL)
*   **Description:** The `item_tags` table lacks a `company_id` column and uses permissive RLS policies (`USING (true)`, `WITH CHECK (true)`).
*   **Impact:** Any authenticated user can view, create, or delete tags for any record (clients, tickets, services) across the entire platform, regardless of company affiliation.
*   **Affected Files:** `supabase/migrations/20260106110000_unified_tags_schema.sql`.
*   **Remediation:** Add `company_id` to `item_tags`, populate it via trigger from parent records, and enforce strict RLS.

### 3. Fail-Open Signature Verification in Stripe Webhook (HIGH)
*   **Description:** The `payment-webhook-stripe` Edge Function skips signature verification if the `webhook_secret_encrypted` is missing or if the signature header is absent/empty, effectively failing open.
*   **Impact:** An attacker could spoof Stripe events (e.g., `checkout.session.completed`) to mark invoices as paid without actual payment.
*   **Affected Files:** `supabase/functions/payment-webhook-stripe/index.ts`.
*   **Remediation:** Implement "Fail Closed" logic. If the secret or signature is missing, reject the request (401/400).

### 4. Exposed Debug Endpoints in `verifactu-dispatcher` (HIGH)
*   **Description:** The `verifactu-dispatcher` Edge Function exposes debug endpoints (`debug-test-update`, `debug-env`, `debug-aeat-process`) that allow arbitrary database updates and environment variable leakage.
*   **Impact:** Unauthorized users could modify VeriFactu event states, trigger AEAT submissions, or view sensitive configuration (environment settings).
*   **Affected Files:** `supabase/functions/verifactu-dispatcher/index.ts`.
*   **Remediation:** Remove all debug code blocks and endpoints.

## Proposed Actions
1.  **Immediate PR:** Fix RLS policies for `payment_integrations` and `item_tags`.
2.  **Secondary PR:** Harden `payment-webhook-stripe` and `verifactu-dispatcher` Edge Functions.

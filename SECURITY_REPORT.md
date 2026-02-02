# Security Audit Report - Simplifica CRM

**Date:** March 12, 2026
**Auditor:** Jules (Senior Security Engineer)

## Summary
A recurring security audit of the "Simplifica" repository has identified **4 Critical/High** vulnerabilities. These vulnerabilities range from data leakage between tenants (Cross-Tenant Access) to potential payment spoofing and environment secret exposure.

## Findings

### 1. `payment_integrations` Cross-Tenant Data Leak (CRITICAL)
*   **Location:** Database (RLS Policies)
*   **Description:** The RLS policies for `payment_integrations` (specifically `payment_integrations_select` and others) verify that the user is an `admin`, `owner`, or `super_admin`, but **fail to verify that the user belongs to the same company** as the integration record.
*   **Risk:** Any administrator of Company A can view and modify the Stripe/PayPal keys (and encrypted secrets) of Company B.
*   **Remediation:** Update RLS policies to strictly join `public.users` and enforce `u.company_id = payment_integrations.company_id`.

### 2. `item_tags` Unrestricted Access (CRITICAL)
*   **Location:** Database (RLS Policies)
*   **Description:** The `item_tags` table uses `USING (true)` and `WITH CHECK (true)` for all authenticated users.
*   **Risk:** Any logged-in user (including basic members or clients) can read, create, update, or delete tags for *any* record (invoices, clients, tickets) across the entire platform, regardless of company affiliation.
*   **Remediation:**
    1.  Add `company_id` column to `item_tags`.
    2.  Implement a trigger to auto-populate `company_id` from the parent record.
    3.  Enforce RLS based on `company_id`.

### 3. `verifactu-dispatcher` Debug Backdoors (CRITICAL)
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:** The Edge Function contains several "debug" actions (`debug-env`, `debug-test-update`, `diag`) that are accessible to any authenticated user (or via improper CORS config).
*   **Risk:**
    *   **Secret Leak:** `debug-env` returns the `VERIFACTU_CERT_ENC_KEY` length and other config.
    *   **Data Integrity:** `debug-test-update` allows arbitrary modification of VeriFactu event attempts and errors.
    *   **IDOR:** `debug-aeat-process` allows triggering AEAT submission logic for arbitrary companies.
*   **Remediation:** Remove all debug endpoints immediately.

### 4. `payment-webhook-stripe` Fail-Open Signature Verification (HIGH)
*   **Location:** `supabase/functions/payment-webhook-stripe/index.ts`
*   **Description:** The signature verification logic is conditional: `if (integration?.webhook_secret_encrypted && stripeSignature)`. If an attacker sends a request *without* a signature header, or if the integration is misconfigured, the check is skipped, and the function proceeds to trust the `payment_link_token` in the metadata.
*   **Risk:** An attacker could craft a fake Stripe webhook event with a valid `payment_link_token` (which might be guessable or leaked) to mark an invoice as "paid" without actual payment.
*   **Remediation:** Implement "Fail Closed" logic. If the secret exists, signature presence and validity must be mandatory. Return 401/500 otherwise.

## Recommended Actions
The following PRs will be created to address the most immediate risks:
1.  **Fix `payment_integrations` RLS**: Migration to strictly enforce company boundaries.
2.  **Harden Edge Functions**: Remove debug endpoints from `verifactu-dispatcher` and fix signature logic in `payment-webhook-stripe`.

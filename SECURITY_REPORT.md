# Security Audit Report - April 2026

## Executive Summary
This report outlines critical and high-priority security findings detected during the recurrent audit of the "Simplifica" CRM. The most critical issue is a cross-tenant data leak in the `payment_integrations` table, which allows administrators of one company to access payment credentials of others. A high-priority vulnerability was also found in the Stripe webhook handler, which could allow payment spoofing.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in Payment Integrations
*   **Severity:** Critical
*   **Affected Resource:** Database Table `public.payment_integrations` (RLS Policies)
*   **Description:** The Row Level Security (RLS) policies for `payment_integrations` (`select`, `insert`, `update`, `delete`) verify that the user has an 'admin', 'owner', or 'super_admin' role but fail to verify that the user belongs to the same company as the payment integration record.
*   **Impact:** A malicious or compromised admin account from "Company A" can view, modify, or delete Stripe/PayPal API keys and secrets of "Company B", "Company C", etc. This could lead to theft of funds or disruption of service for other tenants.
*   **Remediation:** Update the RLS policies to strictly enforce `AND u.company_id = payment_integrations.company_id` for non-super-admin users.

### 2. [HIGH] 'Fail Open' Authentication in Stripe Webhook
*   **Severity:** High
*   **Affected Resource:** Edge Function `payment-webhook-stripe`
*   **Description:** The webhook handler attempts to verify the Stripe signature only if the payment integration and its encrypted secret are found. If the integration record is missing or the secret is not configured, the code skips the verification step and proceeds to process the payment event as valid.
*   **Impact:** An attacker could exploit this by targeting an invoice in a company with a missing or misconfigured payment integration. By sending a forged webhook payload (with a valid `payment_link_token` in metadata), they could mark an invoice as "paid" without actually paying.
*   **Remediation:** Implement "Fail Closed" logic. If the signature cannot be verified (due to missing config or invalid signature), the request must be rejected immediately.

### 3. [LOW] Potential SSR Configuration Exposure
*   **Severity:** Low
*   **Affected Resource:** `src/environments/environment.ts`
*   **Description:** The file contains a Supabase key that does not follow standard JWT format (`sb_publishable_...`). While likely a publishable key, it should be verified.
*   **Remediation:** Ensure only the `anon` key is exposed in the frontend environment. Verify `sb_publishable_...` is indeed the correct anon key.

## Action Plan
1.  **Immediate Fix:** Apply a migration to secure `payment_integrations` RLS policies.
2.  **Immediate Fix:** Patch `payment-webhook-stripe` to enforce signature verification.

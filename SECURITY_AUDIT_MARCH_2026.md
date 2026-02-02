# Security Audit Report - Simplifica CRM (March 2026)

## Executive Summary
A critical security regression was detected, reverting the codebase to a state from late January 2026. This has re-introduced previously patched vulnerabilities in RLS policies and Edge Functions.

**Immediate Action Required:** Apply critical patches to data layer (RLS) and external integrations (Webhooks, VeriFactu).

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
*   **Location:** Database (RLS Policies)
*   **Description:** The RLS policies for `payment_integrations` check if a user is an admin but fail to verify that the user belongs to the same `company_id` as the integration record.
*   **Impact:** Any admin from any company can view and modify payment credentials (Stripe/PayPal keys) of ALL other companies.
*   **Status:** **Regression** (Previously fixed).

### 2. [CRITICAL] Cross-Tenant Data Leak in `item_tags`
*   **Location:** Database (`item_tags` table)
*   **Description:** The table lacks a `company_id` column and uses polymorphic associations. The RLS policies use `USING (true)`, granting read/write access to ALL tags for ALL authenticated users across all companies.
*   **Impact:** Total exposure of tagging data.
*   **Status:** **Regression**.

### 3. [CRITICAL] IDOR / Remote Code Execution in `verifactu-dispatcher`
*   **Location:** Edge Function (`verifactu-dispatcher`)
*   **Description:** Debug endpoints (`debug-test-update`, `debug-env`, `diag`) are exposed. They allow unauthenticated (or authorized but unchecked) manipulation of VeriFactu event states and retrieval of sample data/environment variables.
*   **Impact:** Attackers can reset retry counters, view raw event data, and inspect environment configurations.
*   **Status:** **Regression**.

### 4. [HIGH] Fail-Open Signature Verification in Payment Webhooks
*   **Location:** Edge Functions (`payment-webhook-stripe`, `payment-webhook-paypal`)
*   **Description:** Signature verification is skipped if configuration secrets or signature headers are missing.
*   **Impact:** Attackers can spoof payment events (marking invoices as paid) by sending payloads without signatures.
*   **Status:** **Regression**.

## Plan of Action

1.  **RLS Remediation:** Create a migration to strictly enforce `company_id` checks on `payment_integrations` and restructure `item_tags` to include `company_id`.
2.  **Edge Function Hardening:**
    *   Remove debug endpoints from `verifactu-dispatcher`.
    *   Implement "Fail Closed" logic in Stripe and PayPal webhooks.

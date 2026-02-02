# Security Audit Report - Simplifica CRM

**Date:** March 12, 2026
**Auditor:** Jules (Senior Security Engineer)
**Scope:** RLS, Edge Functions, Financial Logic.

## Executive Summary
Several critical vulnerabilities were identified in the data layer (RLS) and Edge Functions. These issues pose immediate risks of data leakage (cross-tenant access) and unauthorized actions. The codebase appears to have suffered a regression to a state prior to recent security fixes.

## Findings

### 1. [CRITICAL] Global Data Leak via `item_tags` Table
*   **Description:** The `item_tags` table, used for tagging clients, tickets, and services, lacks a `company_id` column and has "Fail Open" RLS policies (`USING (true)`).
*   **Impact:** Any authenticated user from any company can view, insert, update, and delete tags for any record belonging to any other company. This allows mapping out another company's client base and internal organization.
*   **Remediation:** Add `company_id` column, backfill data from parent records, and enforce strict RLS policies.

### 2. [CRITICAL] Cross-Tenant Access to Payment Integrations
*   **Description:** The `payment_integrations` table RLS policies check if the user is an admin/owner but fail to verify that the user belongs to the *same company* as the integration record.
*   **Impact:** A malicious or compromised admin account can list and modify Stripe/PayPal API credentials for all other companies on the platform.
*   **Remediation:** Update RLS policies to enforce `company_id` matching between the user and the record.

### 3. [HIGH] Fail-Open Signature Verification in Stripe Webhook
*   **Description:** The `payment-webhook-stripe` Edge Function skips signature verification if the encryption key or signature header is missing, proceeding to process the event.
*   **Impact:** An attacker can forge payment events (e.g., marking invoices as paid) by sending requests without a signature or with manipulated metadata.
*   **Remediation:** Implement "Fail Closed" logic. If verification prerequisites are missing, reject the request.

### 4. [HIGH] Exposed Debug Endpoints in VeriFactu Dispatcher
*   **Description:** The `verifactu-dispatcher` Edge Function exposes `debug-*` actions (e.g., `debug-env`, `debug-test-update`) that leak environment variables (including configuration keys) and allow arbitrary modification of `verifactu.events`.
*   **Impact:** Leakage of sensitive configuration and potential for data tampering or service disruption.
*   **Remediation:** Remove all debug endpoints in the production codebase.

## Execution Plan
We will address these issues via the following Pull Requests:
1.  **Fix RLS Policies**: Migration to secure `item_tags` and `payment_integrations`.
2.  **Secure Webhooks**: Patch `payment-webhook-stripe` to enforce signatures.
3.  **Harden Dispatcher**: Remove debug code from `verifactu-dispatcher`.

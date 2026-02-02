# Security Audit Report - Simplifica CRM

**Date:** March 13, 2026
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A security audit was performed on the `Simplifica` CRM codebase, focusing on RLS, Edge Functions, and Financial Logic. Critical vulnerabilities were identified in the data layer (RLS) that permit cross-tenant data access (IDOR) and global access to tagging data. Additionally, a high-severity "Fail Open" vulnerability was found in the Stripe webhook handler.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
*   **Risk:** Critical.
*   **Description:** The RLS policies for `payment_integrations` check if a user is an admin/owner but fail to verify if the user belongs to the *same company* as the integration record.
*   **Impact:** An administrator of "Company A" can view and potentially modify payment integration secrets (Stripe/PayPal keys) of "Company B" by guessing or enumerating IDs.
*   **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Current state).
*   **Remediation:** Update RLS policies to enforce `payment_integrations.company_id = users.company_id`.

### 2. [CRITICAL] Global Access to `item_tags`
*   **Risk:** Critical.
*   **Description:** The `item_tags` table uses policies `USING (true)` and `WITH CHECK (true)` for all authenticated users.
*   **Impact:** Any logged-in user (including employees or clients of any company) can read, create, or delete tags for any record (client, ticket, service) across the entire platform.
*   **Location:** `supabase/migrations/20260106110000_unified_tags_schema.sql`.
*   **Remediation:** Add `company_id` to `item_tags`, populate it via trigger from parent records, and enforce strict RLS.

### 3. [HIGH] "Fail Open" Signature Verification in `payment-webhook-stripe`
*   **Risk:** High.
*   **Description:** The webhook handler skips signature verification if the `webhook_secret_encrypted` is missing or if the `stripe-signature` header is absent, but continues to process the payment logic.
*   **Impact:** An attacker could forge payment events (e.g., mark an invoice as paid) without a valid Stripe signature, provided they know a valid `payment_link_token`.
*   **Location:** `supabase/functions/payment-webhook-stripe/index.ts`.
*   **Remediation:** Implement "Fail Closed" logic. Return `401 Unauthorized` immediately if verification credentials or headers are missing.

### 4. [MEDIUM] Service Role Key Usage
*   **Risk:** Medium.
*   **Description:** `payment-webhook-stripe` uses `SUPABASE_SERVICE_ROLE_KEY`. While necessary for webhooks, it bypasses RLS.
*   **Remediation:** Ensure all queries using this key are strictly scoped and validated (e.g., ensuring the invoice exists and belongs to the correct context).

## Proposed Actions
1.  **Immediate Fix (PR 1):** Apply strict RLS to `payment_integrations` and `item_tags` via a new migration.
2.  **Immediate Fix (PR 2):** Patch `payment-webhook-stripe` to fail closed.

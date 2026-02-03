# Security Audit Report - Simplifica CRM
**Date:** March 24, 2026
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A comprehensive security audit of the Simplifica CRM codebase (Supabase + Angular) has identified **2 Critical** and **2 High** severity vulnerabilities. The most critical findings relate to Row Level Security (RLS) policies that allow cross-tenant data leakage.

## Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
*   **Description:** The RLS policies for `payment_integrations` check if a user is an admin/owner but fail to verify that the user belongs to the *same company* as the integration record.
*   **Impact:** Any authenticated admin of *any* company can view, modify, or delete payment integration credentials (API keys, secrets) of *all other companies*. This effectively compromises the financial security of all tenants.
*   **Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Source of regression).
*   **Recommendation:** Update RLS policies to strictly enforce `payment_integrations.company_id = user.company_id`.

### 2. Global Access to `item_tags` (CRITICAL)
*   **Description:** The `item_tags` table uses `USING (true)` and `WITH CHECK (true)` policies for authenticated users. The table lacks a `company_id` column, making it impossible to segment data by tenant.
*   **Impact:** Any authenticated user can view, create, or delete tags for any item (ticket, client, invoice) belonging to any other company. This is a massive privacy leak and data integrity risk.
*   **Affected File:** `supabase/migrations/20260106110000_unified_tags_schema.sql`.
*   **Recommendation:** Add `company_id` to `item_tags`, backfill data, and enforce strict RLS.

### 3. "Fail Open" Logic in Stripe Webhook (HIGH)
*   **Description:** The `payment-webhook-stripe` Edge Function skips signature verification if the payment integration record or webhook secret is missing, proceeding to process the payment event.
*   **Impact:** An attacker could forge payment events (e.g., `payment_intent.succeeded`) for a company without active integrations or with misconfigured secrets, potentially triggering fraudulent invoice confirmations or service provisioning.
*   **Affected File:** `supabase/functions/payment-webhook-stripe/index.ts`.
*   **Recommendation:** Implement strict "Fail Closed" logic. If credentials are missing, reject the request immediately.

### 4. Debug Endpoints Exposed in VeriFactu Dispatcher (HIGH)
*   **Description:** The `verifactu-dispatcher` Edge Function contains debug code blocks (`debug-test-update`, `debug-env`, etc.) that allow arbitrary state modification and environment variable inspection. These blocks rely on the service role client and lack proper authorization checks for the target company.
*   **Impact:** If the function is accessible (public or leaked key), an attacker could manipulate VeriFactu event states or leak sensitive configuration details.
*   **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`.
*   **Recommendation:** Remove all debug code blocks from the production codebase.

## Plan of Action
1.  **Immediate Remediation:** Apply a new migration to fix RLS for `payment_integrations` and `item_tags`.
2.  **Code Fixes:** Patch `payment-webhook-stripe` and `verifactu-dispatcher` to remove logic flaws and backdoors.

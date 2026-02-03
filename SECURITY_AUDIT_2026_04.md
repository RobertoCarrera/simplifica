# Security Audit Report - April 2026

**Date:** April 2026
**Auditor:** Jules (Senior Security Engineer)
**Target:** Simplifica CRM (Supabase + Angular)

## Summary
This audit identified **2 Critical** and **2 High** severity vulnerabilities. Immediate action is required to prevent data leaks between tenants and potential financial fraud.

## Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
- **Description:** The RLS policy `payment_integrations_select` (and others) checks if the user is an admin but **fails to check if the record belongs to the user's company**.
- **Impact:** Any admin of any company can query the API to list all payment integration secrets (Stripe/PayPal credentials) of all other companies.
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Remediation:** Update policies to join `payment_integrations` with `users` on `company_id`.

### 2. Global Access to `item_tags` (CRITICAL)
- **Description:** The `item_tags` table lacks a `company_id` column and uses a "allow all" RLS policy (`TO authenticated USING (true)`).
- **Impact:** Any authenticated user can read, create, update, or delete tags for any record (client, ticket, etc.) belonging to any other company.
- **Location:** `supabase/migrations/20260106110000_unified_tags_schema.sql`
- **Remediation:** Add `company_id` column, backfill data from parent records, and enforce strict RLS.

### 3. "Fail Open" Signature Verification in `payment-webhook-stripe` (HIGH)
- **Description:** The webhook handler skips signature verification if the `stripe-signature` header or the encrypted secret is missing.
- **Impact:** An attacker can forge a payment success event (without a valid signature) to mark invoices as "paid" without actual payment.
- **Location:** `supabase/functions/payment-webhook-stripe/index.ts`
- **Remediation:** Enforce "Fail Closed" logic. If signature or secret is missing, return 401.

### 4. Exposed Debug Endpoints in `verifactu-dispatcher` (HIGH)
- **Description:** The edge function contains debug blocks (e.g., `debug-test-update`, `debug-last-event`) accessible via POST requests.
- **Impact:** An attacker could read sensitive event logs, modify event states, or inspect environment configurations.
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Remediation:** Remove all debug code blocks.

## Proposed Action Plan
1. Create a migration `20260401000000_fix_critical_rls.sql` to fix findings #1 and #2.
2. Patch `payment-webhook-stripe` to enforce signature verification.
3. Patch `verifactu-dispatcher` to remove debug endpoints.

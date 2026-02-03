# Security Report - Simplifica CRM

## Executive Summary
This audit identified **CRITICAL** vulnerabilities in the Data Layer (RLS) that allow cross-tenant data access, and **HIGH** severity issues in Edge Functions regarding payment processing and debug endpoints.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Policies currently in DB).
- **Description:** RLS policies for `payment_integrations` check if the user is an admin but **do not check if the user belongs to the same company** as the integration record.
- **Impact:** Any admin from Company A can view, edit, or delete Stripe/PayPal keys of Company B.
- **Risk:** Complete compromise of payment credentials across all tenants.

### 2. [CRITICAL] Global Access in `item_tags`
- **Affected File:** `supabase/migrations/20260106110000_unified_tags_schema.sql` (Policies currently in DB).
- **Description:** RLS policies use `TO authenticated USING (true)`, allowing all authenticated users to read/write all tags. The table lacks a `company_id` column for filtering.
- **Impact:** Any user can see or modify tags attached to clients/tickets of other companies.
- **Risk:** Data leakage and data integrity violation.

### 3. [HIGH] "Fail Open" Logic in Stripe Webhook
- **Affected File:** `supabase/functions/payment-webhook-stripe/index.ts`.
- **Description:** If the webhook secret or signature header is missing, the function skips verification and proceeds to process the payment (`if (integration?.webhook_secret_encrypted && stripeSignature) ...`).
- **Impact:** An attacker can forge payment events without a signature to mark invoices as paid.
- **Risk:** Financial loss and fraud.

### 4. [HIGH] IDOR and Debug Endpoints in `verifactu-dispatcher`
- **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`.
- **Description:** The function exposes `debug-test-update`, `debug-env`, and `debug-aeat-process` endpoints. These use `body.company_id` to access data via the Service Role key without verifying the caller's permission for that company.
- **Impact:** Any user can trigger debug actions or view environment variables/event data for any company.
- **Risk:** Information disclosure and unauthorized modification of VeriFactu events.

## Recommended Actions
1.  **Immediate:** Apply RLS fixes to `payment_integrations` and `item_tags`.
2.  **Immediate:** Patch `payment-webhook-stripe` to enforce strict signature verification.
3.  **Soon:** Remove debug endpoints from `verifactu-dispatcher` and implement strict `company_id` checks.

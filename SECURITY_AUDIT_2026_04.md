# Security Audit Report - April 2026

## Executive Summary
A recurring security audit of the Simplifica CRM repository identified **Critical** vulnerabilities in the Data Layer (RLS) and Edge Functions. These issues expose the system to cross-tenant data leaks, unauthenticated data corruption, and payment fraud. The codebase appears to have reverted to a pre-fix state (January 2026), necessitating the re-application of critical patches.

## Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
*   **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`, `payment_integrations` table.
*   **Issue:** The RLS policies (`select`, `insert`, etc.) granted `TO public` allow any user with an 'admin' role to access `payment_integrations` records of **any** company. The policy checks if `auth.uid()` is an admin but fails to verify if the user belongs to the same `company_id` as the record.
*   **Impact:** A malicious admin from Company A can view Stripe/PayPal API secrets of Company B.
*   **Remediation:** Update policies to enforce `user.company_id = record.company_id`.

### 2. Global Access to `item_tags` (CRITICAL)
*   **Location:** `supabase/migrations/20260106110000_unified_tags_schema.sql`, `item_tags` table.
*   **Issue:** The table lacks a `company_id` column and uses `TO authenticated USING (true)` policies.
*   **Impact:** Any authenticated user (including basic employees or clients) can view, create, or delete tags for *any* record (invoices, tickets, clients) of *any* company.
*   **Remediation:** Add `company_id` column, backfill data, and restrict access via strict RLS policies.

### 3. Payment Webhook "Fail Open" (HIGH)
*   **Location:** `supabase/functions/payment-webhook-stripe/index.ts`
*   **Issue:** The signature verification logic is bypassed if the integration config or signature header is missing (`if (integration?.webhook_secret_encrypted && stripeSignature)`).
*   **Impact:** Attackers can send forged payment events (without signatures) to mark invoices as "PAID" without actual payment.
*   **Remediation:** Enforce "Fail Closed" logic: return 401/400 immediately if secrets or signatures are missing.

### 4. Unauthenticated Debug Endpoints (HIGH)
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Issue:** Debug endpoints (`debug-test-update`, `debug-env`, etc.) are exposed and accessible to anyone. They use the Admin Service Role client to perform operations like modifying event status or dumping environment variables.
*   **Impact:** Unauthenticated attackers can corrupt VeriFactu event data (RCE on data) or leak configuration details.
*   **Remediation:** Remove these debug endpoints entirely or restrict them behind `service_role` authentication only.

## Action Plan
1.  **PR 1 (RLS):** Fix `payment_integrations` policies and harden `item_tags` schema/policies.
2.  **PR 2 (Functions):** Patch `payment-webhook-stripe` and `verifactu-dispatcher`.

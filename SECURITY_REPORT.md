# Security Audit Report - March 12, 2026

## Findings

### 1. Data Layer (RLS) - CRITICAL
*   **Vulnerability**: Cross-tenant data leak in `payment_integrations`.
*   **Affected File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Policy Definition)
*   **Description**: The current RLS policies for `payment_integrations` allow any user with an 'admin' or 'owner' role to view payment integrations for *all* companies. The policy checks if the user is an admin but fails to restrict access to the user's specific `company_id`.
*   **Impact**: High. An admin of one company can view Stripe/PayPal credentials of other companies.

### 2. Data Layer (RLS) - CRITICAL
*   **Vulnerability**: Global unrestricted access to `item_tags`.
*   **Affected File**: `supabase/migrations/20260106110000_unified_tags_schema.sql`
*   **Description**: The `item_tags` table lacks a `company_id` column and uses `TO authenticated USING (true)` policies.
*   **Impact**: Critical. Any authenticated user can read, create, or delete tags for any record (client, ticket, service) in the system, bypassing tenant isolation.

### 3. Edge Functions - HIGH
*   **Vulnerability**: "Fail Open" Signature Verification in `payment-webhook-stripe`.
*   **Affected File**: `supabase/functions/payment-webhook-stripe/index.ts`
*   **Description**: The function verifies the Stripe signature only `if (integration?.webhook_secret_encrypted && stripeSignature)`. If the secret is missing (e.g., configuration error) or the signature is omitted, the code bypasses verification and processes the payment event.
*   **Impact**: High. Attackers could forge payment events to mark invoices as paid without actual payment.

### 4. Edge Functions - HIGH
*   **Vulnerability**: Exposed Debug Endpoints in `verifactu-dispatcher`.
*   **Affected File**: `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description**: The function contains blocks for `debug-test-update`, `debug-env`, `debug-last-event`, etc., which expose environment variables and allow arbitrary state modification.
*   **Impact**: High. Leakage of configuration secrets and potential for data corruption or unauthorized state transitions.

## Proposed Remediation

1.  **RLS Fixes**:
    *   Update `payment_integrations` policies to enforce `company_id` matching.
    *   Add `company_id` to `item_tags`, implement a trigger to auto-populate it from parent records, and enforce strict RLS.
2.  **Edge Function Hardening**:
    *   Enforce "Fail Closed" logic in Stripe webhook.
    *   Remove debug endpoints from VeriFactu dispatcher.

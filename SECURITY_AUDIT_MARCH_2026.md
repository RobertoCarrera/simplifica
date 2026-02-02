# Security Audit Report - March 2026

## Executive Summary
A comprehensive security audit of the "Simplifica" CRM platform was conducted on March 12, 2026. Critical vulnerabilities were identified in the data layer (RLS) and Edge Functions, posing significant risks of data leakage and unauthorized access.

## Summary of Findings

| Severity | Component | Issue | Impact |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | Database (RLS) | `payment_integrations` Cross-Tenant Leak | Admins of any company can view API keys/secrets of ALL other companies. |
| **CRITICAL** | Database (RLS) | `item_tags` Missing RLS | Any authenticated user can read/modify/delete tags for any record in the system. |
| **HIGH** | Edge Function | `verifactu-dispatcher` IDOR | IDOR on debug endpoints allowing modification of other companies' tax event history. |
| **HIGH** | Edge Function | `payment-webhook-stripe` Fail Open | Webhook signature verification can be bypassed by omitting the signature header. |
| **HIGH** | Edge Function | `payment-webhook-paypal` Fail Open | Similar logic flaw potentially allowing bypass if headers are manipulated. |

## Detailed Findings

### 1. `payment_integrations` Cross-Tenant Data Leak (CRITICAL)
**Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
**Description:** The RLS policies for `payment_integrations` verify that the current user is an admin (`owner`, `admin`, `super_admin`) but fail to verify that the `payment_integration` record belongs to the user's company (`company_id`).
**Risk:** An attacker with a valid admin account in *any* company can query `SELECT * FROM payment_integrations` and retrieve Stripe/PayPal credentials for every tenant on the platform.

### 2. `item_tags` Missing RLS (CRITICAL)
**Location:** `supabase/migrations/20260106110000_unified_tags_schema.sql`
**Description:** The `item_tags` table uses policies `USING (true)` for SELECT, INSERT, and DELETE for all `authenticated` users. It also lacks a `company_id` column for efficient filtering.
**Risk:** Malicious users can list all tags or delete tags associated with clients/tickets of competing companies, causing data loss and confusion.

### 3. `verifactu-dispatcher` IDOR on Debug Endpoints (HIGH)
**Location:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:** The function exposes `debug-test-update` and `debug-env` actions. The `debug-test-update` action accepts a `company_id` in the body and modifies event records using the `service_role` client without verifying if the caller belongs to that company.
**Risk:** An attacker can corrupt or alter the audit trail of VeriFactu tax events for other companies.

### 4. `payment-webhook-stripe` Signature Bypass (HIGH)
**Location:** `supabase/functions/payment-webhook-stripe/index.ts`
**Description:** The code checks for signature validity only *if* the signature header is present.
```typescript
if (integration?.webhook_secret_encrypted && stripeSignature) {
  // verify...
}
// Proceed to process payment
```
**Risk:** An attacker can forge a "payment successful" webhook event without a signature header, and the system will process it as valid, marking invoices as paid without actual payment.

## Recommendations & Action Plan

1.  **Immediate Remediation (This Sprint):**
    *   Fix `payment_integrations` RLS policies to strictly enforce `company_id` checks.
    *   Patch `payment-webhook-stripe` to enforce "Fail Closed" logic (reject request if configured secret exists but signature is missing).

2.  **Next Steps:**
    *   Refactor `item_tags` to include `company_id` (backfill required) and enable strict RLS.
    *   Remove or secure `verifactu-dispatcher` debug endpoints with `requireCompanyAccess` checks.
    *   Review `payment-webhook-paypal` for similar "Fail Open" patterns.

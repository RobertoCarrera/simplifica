# Security Audit Report - March 28, 2026

## Executive Summary
This report details the findings from the security audit of the "Simplifica" CRM platform. The audit focused on RLS policies, Edge Functions, and Financial Logic.

**Key Findings:**
- **CRITICAL**: Cross-tenant data leak in `payment_integrations` table via permissive RLS policies.
- **HIGH**: Payment processing bypass in `payment-webhook-stripe` due to "Fail Open" signature verification.
- **HIGH**: Unauthenticated debug endpoints in `verifactu-dispatcher` edge function.

---

## Detailed Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Component**: Database / RLS
- **File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Description**: The RLS policies for `payment_integrations` (Select, Insert, Update, Delete) check if the user is an 'admin' or 'owner' but fail to verify that the user's `company_id` matches the record's `company_id`.
- **Impact**: IDOR. Any authenticated admin of *any* company can list, view, modify, or delete payment integration credentials (API keys, secrets) of *all* other companies.
- **Remediation**: Update RLS policies to strictly enforce `u.company_id = payment_integrations.company_id`.

### 2. [HIGH] "Fail Open" Signature Verification in Stripe Webhook
- **Component**: Edge Functions
- **File**: `supabase/functions/payment-webhook-stripe/index.ts`
- **Description**: The function attempts to verify the Stripe signature *only if* the integration secret and signature header exist. If either is missing (e.g., misconfiguration or malicious omission), the verification block is skipped, and the code proceeds to process the payment event based on the payload content.
- **Impact**: Financial Fraud. An attacker could send a forged "payment success" webhook without a valid signature, marking invoices as paid.
- **Remediation**: Implement "Fail Closed" logic. Reject any request that lacks a signature or active integration configuration.

### 3. [HIGH] Dangerous Debug Endpoints in `verifactu-dispatcher`
- **Component**: Edge Functions
- **File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: The function exposes `debug-test-update`, `debug-env`, and other actions. These blocks update database records or expose environment variables without explicit authorization checks beyond the initial service role client creation (which effectively bypasses RLS for the operations performed *inside* the function).
- **Impact**: Data Integrity / Information Disclosure. An attacker could reset event attempts, corrupt data, or view environment details.
- **Remediation**: Remove these debug endpoints entirely in production code.

---

## Action Plan
1. Fix `payment_integrations` RLS policies immediately (Critical).
2. Patch `payment-webhook-stripe` to enforce signature verification (High).
3. (Planned for next iteration) Remove debug endpoints from `verifactu-dispatcher`.

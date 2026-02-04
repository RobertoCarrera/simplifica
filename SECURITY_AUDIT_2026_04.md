# Security Audit Report - April 2026

## Executive Summary
This audit focused on Critical RLS vulnerabilities and High-Priority Edge Function security.
**Status**: 2 Critical/High issues identified and remediated.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Severity**: Critical
- **Affected File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Description**: The RLS policies for `payment_integrations` (containing Stripe/PayPal keys) were set to `TO public` and lacked a check for `company_id`.
- **Risk**: Any authenticated admin of *any* company could read the payment secrets of *all* other companies.
- **Remediation**: Replaced policies with strict checks joining `public.users` and enforcing `company_id` match.

### 2. [HIGH] Fail-Open Vulnerability in `payment-webhook-stripe`
- **Severity**: High
- **Affected File**: `supabase/functions/payment-webhook-stripe/index.ts`
- **Description**:
  1. `ENCRYPTION_KEY` defaulted to a hardcoded development key if missing.
  2. If the integration configuration was missing or corrupted, the webhook signature verification was skipped, but the payment processing continued.
- **Risk**: An attacker could forge payment events (e.g., `checkout.session.completed`) without a valid signature, potentially marking unpaid invoices as paid.
- **Remediation**:
  - Enforced `ENCRYPTION_KEY` presence (Fail Closed).
  - Enforced signature verification. If integration/secret is missing, the request is rejected.

### 3. [MEDIUM] Potential IDOR in `issue-invoice`
- **Severity**: Medium/Low (Mitigated)
- **Affected File**: `supabase/functions/issue-invoice/index.ts`
- **Description**: The function relies on RLS to filter invoices.
- **Risk**: If RLS policies on `invoices` were weak, an attacker could issue invoices for other companies.
- **Verification**: Confirmed `invoices` RLS policies (via `20260129160000_finance_security_logic.sql`) correctly enforce `company_members` checks. No action needed.

## Action Plan
- [x] Create report.
- [ ] Apply RLS fix for `payment_integrations`.
- [ ] Patch `payment-webhook-stripe`.

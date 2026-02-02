# Security Audit Report - March 15, 2026

## Executive Summary
A recurring security audit was performed on the Simplifica CRM codebase. The audit identified critical vulnerabilities in the Data Layer (RLS) and Edge Functions, primarily stemming from a regression to a January 2026 state.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Description**: The RLS policies for `payment_integrations` check if a user is an admin/owner but fail to verify if the user belongs to the same company as the integration record.
- **Impact**: Any admin of any company can view, modify, or delete payment integration secrets (Stripe/PayPal keys) of *any other company*.
- **Affected File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (source of regression).
- **Remediation**: Update RLS policies to strictly enforce `u.company_id = payment_integrations.company_id`.

### 2. [CRITICAL] Unrestricted Access to `item_tags`
- **Description**: The `item_tags` table has RLS policies defined as `USING (true)` and `WITH CHECK (true)` for all authenticated users.
- **Impact**: Any authenticated user can read, create, or delete tags for any record (client, ticket, etc.) belonging to any company.
- **Affected File**: `supabase/migrations/20260106110000_unified_tags_schema.sql`.
- **Remediation**: Add `company_id` column to `item_tags` and enforce strict RLS.

### 3. [HIGH] Unauthenticated Debug Endpoints in `verifactu-dispatcher`
- **Description**: The `verifactu-dispatcher` Edge Function exposes debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`, `diag`) that allow executing arbitrary logic, viewing environment variables, and modifying database state without specific authentication checks (beyond general function invocation).
- **Impact**: IDOR, Information Disclosure, and potential RCE/Data Corruption.
- **Affected File**: `supabase/functions/verifactu-dispatcher/index.ts`.
- **Remediation**: Remove these debug endpoints entirely in production code.

### 4. [HIGH] "Fail Open" Signature Verification in `payment-webhook-stripe`
- **Description**: The Stripe webhook handler skips signature verification if the `webhook_secret_encrypted` is missing or if the signature header is absent.
- **Impact**: Attackers can spoof payment events (e.g., mark invoices as paid) by sending crafted payloads without a valid signature.
- **Affected File**: `supabase/functions/payment-webhook-stripe/index.ts`.
- **Remediation**: Implement "Fail Closed" logic. Reject requests if secrets or signatures are missing.

## Action Plan
We will address the following issues immediately in this PR:
1. Fix `payment_integrations` RLS policies.
2. Remove debug endpoints from `verifactu-dispatcher`.

Other issues (`item_tags`, `payment-webhook-stripe`) will be addressed in subsequent PRs to maintain small, reviewable changes.

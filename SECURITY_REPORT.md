# Security Audit Report - March 2026

## Overview
This report summarizes the findings of a security audit performed on the Simplifica CRM codebase. The audit focused on RLS policies, Edge Functions, and financial logic.

## Findings

### 1. CRITICAL: Cross-Tenant Data Leak in `payment_integrations`
- **Severity**: Critical
- **Description**: RLS policies for `payment_integrations` (`select`, `insert`, `update`, `delete`) allow any user with an 'admin' role (in *any* company) to access payment integration secrets of *all* companies. The policies check for admin role but fail to check if the user belongs to the same `company_id` as the integration record.
- **Affected Files**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (introduced the flaw).
- **Risk**: malicious admin from Company A can steal Stripe/PayPal secrets of Company B.
- **Remediation**: Update RLS policies to enforcing `company_id` match between the user and the record.

### 2. CRITICAL: Global Access to `item_tags`
- **Severity**: Critical
- **Description**: The `item_tags` table has RLS enabled but uses `USING (true)` and `WITH CHECK (true)` for all authenticated users. This allows any logged-in user to read, create, modify, or delete tags for any record (client, ticket, service) globally, across all tenants.
- **Affected Files**: `supabase/migrations/20260106110000_unified_tags_schema.sql`.
- **Risk**: Cross-tenant data leak and integrity violation. Competitors could see or mess with tags.
- **Remediation**: Add `company_id` column to `item_tags`, backfill it from related records, and update RLS to enforce `company_id`.

### 3. HIGH: Fail-Open Vulnerability in `payment-webhook-paypal`
- **Severity**: High
- **Description**: The webhook handler skips signature verification if the integration secrets (`webhook_secret_encrypted`, `credentials_encrypted`) are missing or cannot be decrypted. It proceeds to process the payment event as valid.
- **Affected Files**: `supabase/functions/payment-webhook-paypal/index.ts`.
- **Risk**: An attacker could send a fake "payment success" webhook for an invoice. If the integration is partially configured or the attacker can trick the system into not finding secrets, the invoice is marked as paid without payment.
- **Remediation**: The function must return an error (500 or 401) if secrets are missing, rather than skipping verification.

### 4. HIGH: Unsecured Debug Endpoints in `verifactu-dispatcher`
- **Severity**: High
- **Description**: The `verifactu-dispatcher` function exposes several debug endpoints (`debug-test-update`, `debug-env`, `debug-aeat-process`) that are not protected by authentication or authorization checks (beyond a basic valid JWT, but no role/company check).
- **Affected Files**: `supabase/functions/verifactu-dispatcher/index.ts`.
- **Risk**: Unauthorized users could view environment variables, modify VeriFactu event states, or trigger AEAT submissions for any company by guessing the `company_id`.
- **Remediation**: Implement `requireCompanyAccess` to enforce that the caller is an admin of the target company. Remove sensitive debug endpoints like `debug-env`.

## Next Steps
PRs will be created to address these findings immediately.

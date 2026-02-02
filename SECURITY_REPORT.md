# Security Audit Report - Simplifica CRM

**Date:** March 12, 2026
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A security audit of the Simplifica CRM codebase (Supabase + Angular) has identified **2 Critical** and **2 High** severity vulnerabilities.
The critical issues involve Cross-Tenant Data Leaks due to misconfigured Row Level Security (RLS) policies.
The high severity issues involve "Fail Open" logic in payment processing and exposure of sensitive debug endpoints in production functions.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Description:** The RLS policies for `payment_integrations` check if a user is an 'admin' or 'owner' but fail to verify if the user belongs to the *same company* as the integration record.
- **Impact:** Any admin of Company A can view, edit, or delete payment integration secrets (Stripe/PayPal keys) of Company B.
- **Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Source of regression).
- **Remediation:** Update policies to enforce `u.company_id = payment_integrations.company_id`.

### 2. [CRITICAL] Global Data Exposure in `item_tags`
- **Description:** The `item_tags` table has RLS policies defined as `USING (true)` and `WITH CHECK (true)` for all authenticated users. Furthermore, the table lacks a `company_id` column to easily scope access.
- **Impact:** Any authenticated user (even a regular member of one company) can read, insert, or delete tag assignments for ANY record (clients, tickets, etc.) of ANY other company.
- **Affected File:** `supabase/migrations/20260106110000_unified_tags_schema.sql`.
- **Remediation:**
  1. Add `company_id` to `item_tags`.
  2. Implement a trigger to auto-populate `company_id` from parent records.
  3. Enforce strict RLS based on `company_id`.

### 3. [HIGH] "Fail Open" Vulnerability in Stripe Webhook
- **Description:** The `payment-webhook-stripe` Edge Function skips signature verification if the `webhook_secret` is not configured or if the signature header is missing, yet proceeds to process the payment.
- **Impact:** An attacker could spoof payment events (e.g., `payment_intent.succeeded`) to mark invoices as paid without actual payment.
- **Affected File:** `supabase/functions/payment-webhook-stripe/index.ts`.
- **Remediation:** Implement "Fail Closed" logic. Reject requests (401) if secrets or signatures are missing.

### 4. [HIGH] Debug Endpoints Exposed in VeriFactu Dispatcher
- **Description:** The `verifactu-dispatcher` function contains several debug actions (`debug-env`, `debug-test-update`, etc.) that are accessible via POST requests. `debug-env` returns all environment variables (though secrets might be masked or not, the risk is high).
- **Impact:** Information disclosure (environment configuration) and potential unauthorized state modification (`debug-test-update`).
- **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`.
- **Remediation:** Remove these debug blocks entirely for production.

## Next Steps
PRs will be created to address these findings immediately.

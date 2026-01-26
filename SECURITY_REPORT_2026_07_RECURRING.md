# Security Audit Report - July 2026 (Recurring)

**Auditor:** Jules (Security Engineer Agent)
**Date:** July 2026
**Scope:** RLS, Edge Functions, Financial Logic

## Summary
This audit identified critical regressions in Row Level Security (RLS) policies due to file synchronization issues, specifically affecting child tables in the invoicing module. Additionally, a high-severity logic flaw was found in the Stripe webhook handler allowing signature verification bypass.

## Findings

### 1. [CRITICAL] Missing RLS on Child Tables (`invoice_items`, `quote_items`)
- **Description:** The migration enabling RLS on `invoice_items` and `quote_items` (previously identified as `20260620000000_ensure_child_rls.sql`) is missing from the codebase. Currently, these tables may effectively have no active RLS if the database was reset, or rely on default "deny all" if enabled but no policies exist (locking the app), or "allow all" if RLS is disabled. Given the pattern of recent migrations, they likely lack specific policies linking them to `company_members`.
- **Impact:** **IDOR / Data Leak.** If RLS is not enabled, any authenticated user (or anon if exposed) could potentially read or modify line items of other companies if they guess the UUIDs.
- **Remediation:** Re-implement RLS policies that JOIN with parent tables (`invoices`, `quotes`) to enforce `company_members` checks.

### 2. [HIGH] Stripe Webhook Signature Verification Bypass
- **Description:** In `supabase/functions/payment-webhook-stripe/index.ts`, the signature verification logic is conditional:
  ```typescript
  if (integration?.webhook_secret_encrypted && stripeSignature) { ... }
  ```
  If an attacker sends a request *without* the `stripe-signature` header, the check is skipped entirely, even if the company has a webhook secret configured.
- **Impact:** **Financial Fraud.** An attacker who obtains a valid `payment_link_token` (e.g., from a legitimate invoice URL) can send a forged `payment.succeeded` webhook without a signature, marking an invoice as paid without actual payment.
- **Remediation:** Change logic to **require** `stripe-signature` presence and verification whenever `webhook_secret_encrypted` is configured.

### 3. [MEDIUM] Non-functional `booking-manager` Stub
- **Description:** The `booking-manager` Edge Function is a stub returning empty responses. While currently secure (as it does nothing), it represents dead code and a potential future risk if implemented without security review.
- **Status:** Monitor.

### 4. [MEDIUM] Missing `google-calendar-sync`
- **Description:** Security memory indicates a known vulnerability in `google-calendar-sync`, but the file is missing from the repository.
- **Status:** Verify if feature was deprecated or lost.

## Action Plan
1. **Immediate Fix:** Create migration `20260701000000_secure_child_tables_v2.sql` to secure child tables.
2. **Immediate Fix:** Patch `payment-webhook-stripe/index.ts` to enforce signature verification.

# SECURITY AUDIT REPORT - APRIL 2026

## Executive Summary
This audit focused on Critical and High priority areas: RLS Multi-tenancy, Edge Functions Security, and Financial Logic.
Two critical/high vulnerabilities were identified and patches are proposed.

## Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
- **Description:** The RLS policies for `payment_integrations` created in Jan 2026 check if a user is an admin of *any* company, but fail to check if they are an admin of the *specific* company owning the integration record.
- **Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Source of the bad policy).
- **Impact:** An admin of "Company A" can Read/Update/Delete payment keys of "Company B", potentially stealing funds or disrupting service.
- **Mitigation:** A new migration `20260412000000_fix_payment_integrations_rls.sql` will be created to enforce strict `company_id` matching via `company_members` table.

### 2. Unauthenticated IDOR & Debug Endpoints in `verifactu-dispatcher` (HIGH)
- **Description:** The Edge Function exposes several debug endpoints (`debug-env`, `debug-aeat-process`, etc.) that do not require authentication. Additionally, the `retry` and `test-cert` actions accept IDs (`invoice_id`, `company_id`) from the request body without verifying if the caller has access to those resources.
- **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`.
- **Impact:** Unauthenticated attackers can:
  - View environment variables (partial configuration).
  - Trigger AEAT submissions for any company.
  - Reset event status or view sensitive event logs.
  - Verify if a company has valid certificates.
- **Mitigation:**
  - Remove all `debug-*` endpoints.
  - Implement `requireCompanyAccess` and `requireInvoiceAccess` checks for `test-cert` and `retry` actions respectively.

### 3. Invoice Immutability Gap (MEDIUM)
- **Description:** The `invoices_update_policy` checks for company membership but does not prevent updates to invoices that are already "Sent", "Paid", or "Registered" (VeriFactu).
- **Affected File:** `supabase/migrations/20260129160000_finance_security_logic.sql`.
- **Impact:** An admin could maliciously alter a historical invoice after it was reported to AEAT, causing fiscal inconsistencies.
- **Mitigation:** Future PR should add a `status` check to the UPDATE policy or a Trigger to prevent changes to finalized invoices.

## Proposed Actions
1. Apply migration `20260412000000_fix_payment_integrations_rls.sql`.
2. Patch `verifactu-dispatcher` to remove debug code and enforce auth.

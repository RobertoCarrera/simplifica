# Security Audit Report - Simplifica CRM

**Date:** 2026-02-01
**Auditor:** Jules (Senior Security Engineer)

## Summary
This audit focused on RLS/Multi-tenancy integrity, Edge Function security, and Financial Logic. Two significant issues were identified, one CRITICAL related to multi-tenancy enforcement in financial operations, and one HIGH related to data leakage in PDF generation.

## Findings

### 1. [CRITICAL] Broken Multi-tenancy in `convert_quote_to_invoice`
- **Location:** `supabase/migrations/20260129160000_finance_security_logic.sql` (Function: `convert_quote_to_invoice`)
- **Description:** The function relies on `public.users.company_id` to authorize staff members. This column is deprecated in favor of the many-to-many `public.company_members` table.
- **Risk:** If `public.users.company_id` is null, stale, or manipulated, users might be denied access to legitimate resources or, worse, granted access based on obsolete data. It bypasses the current source of truth for organization membership.
- **Remediation:** Update the function to validate membership against `public.company_members` with `status = 'active'`.

### 2. [HIGH] Data Leakage in Invoice QR Generation
- **Location:** `supabase/functions/invoices-pdf/index.ts`
- **Description:** The function sends sensitive invoice metadata (NIF, Total, Date, Hash) via URL parameters to a third-party public API (`api.qrserver.com`) to generate the VeriFactu QR code image.
- **Risk:** Financial metadata is exposed to an external provider. This violates privacy principles and potentially GDPR regulations regarding financial data processing.
- **Remediation:** Implement local QR code generation within the Edge Function using a library like `qrcode-generator` or `qrcode`, eliminating external data transmission.

### 3. [MEDIUM] `issue-invoice` Reliance on Client Input
- **Location:** `supabase/functions/issue-invoice/index.ts`
- **Description:** While the function checks for invoice existence, it accepts `deviceid` and `softwareid` from the client without strong validation against the company's registered devices/software in the context of the invoice.
- **Risk:** A user could potentially sign an invoice using a device ID that doesn't belong to them or is invalid, although RLS likely mitigates direct cross-company usage.
- **Remediation:** Enforce strict validation that `deviceid` belongs to the `company_id` of the invoice.

## Recommended Actions
1. **Immediate:** Apply the fix for `convert_quote_to_invoice` to restore multi-tenancy integrity.
2. **Immediate:** Switch `invoices-pdf` to local QR generation.
3. **Short-term:** Audit all RPCs to ensure no other functions rely on `public.users.company_id`.

# Security Audit Report - Simplifica CRM

**Date:** April 2026
**Auditor:** Jules (Security Engineer)

## Executive Summary
This audit focused on Multi-tenancy (RLS), Edge Functions security, and Financial integrity. Critical vulnerabilities were identified in the `verifactu-dispatcher` Edge Function, specifically regarding exposed debug endpoints and Insecure Direct Object Reference (IDOR) in certificate testing and retry mechanisms. Additionally, `invoices-pdf` was found to have a regression where it bypasses RLS using the Service Role key.

## Findings

### 1. `verifactu-dispatcher`: Exposed Debug Endpoints (CRITICAL)
**Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:** The Edge Function exposes several debug endpoints (`debug-test-update`, `diag`, `debug-last-event`, `debug-aeat-process`, `debug-env`) that are reachable by any authenticated user (or potentially unauthenticated if CORS/Auth checks are loose). These endpoints allow:
- Executing arbitrary updates on VeriFactu events.
- Reading environment configuration (potentially inferring keys or settings).
- Triggering AEAT processes for arbitrary companies.
**Impact:** Data integrity compromise, information disclosure, and potential denial of service (by triggering external API calls).
**Mitigation:** Remove these endpoints entirely or restrict them to super-admin users (if such a role exists and is securely checked). Recommended removal for production.

### 2. `verifactu-dispatcher`: IDOR in `test-cert` and `retry` (CRITICAL)
**Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:**
- The `test-cert` action accepts a `company_id` from the request body and uses the `admin` (Service Role) client to fetch and test the certificate. It does not verify if the requesting user belongs to that company.
- The `retry` action accepts an `invoice_id` and resets its VeriFactu status using the `admin` client, without checking if the user owns the invoice.
**Impact:** A user from Company A could test (and potentially error-out or lock) the certificate of Company B, or manipulate the VeriFactu status of Company B's invoices.
**Mitigation:** Implement strict authorization checks (`requireCompanyAccess`, `requireInvoiceAccess`) before processing these requests.

### 3. `invoices-pdf`: RLS Bypass via Service Role Fallback (HIGH)
**Affected File:** `supabase/functions/invoices-pdf/index.ts`
**Description:** The function attempts to fetch invoice items using the user's context (RLS). However, if that fails or returns few items, it falls back to using the `admin` (Service Role) client.
```typescript
if (!itErr && items && items.length <= 1) { ... admin.from('invoice_items')... }
```
**Impact:** If RLS is intended to hide certain items, this fallback defeats that security control. It also masks potential RLS misconfigurations.
**Mitigation:** Remove the Service Role fallback. The function should rely solely on the user's permissions.

### 4. `payment_integrations`: Potential RLS Gaps (HIGH)
**Context:** Memory indicates recent fixes were needed for `payment_integrations` and `verifactu_settings`.
**Recommendation:** Verify that `payment_integrations` has RLS enabled and strictly filters by `company_id`. Ensure `company_members` is used for authorization.

## Planned Actions
1.  **Remediate `verifactu-dispatcher`**: Remove debug endpoints and implement access controls for `test-cert` and `retry`.
2.  **Remediate `invoices-pdf`**: Remove the insecure service role fallback.

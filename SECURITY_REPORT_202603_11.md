# Security Audit Report - Simplifica CRM
**Date:** March 11, 2026
**Auditor:** Senior Security Engineer (AI)

## Summary
This audit focused on Edge Functions and RLS policies. Critical vulnerabilities were identified in the `verifactu-dispatcher` function, along with high-priority authorization gaps in `issue-invoice` and missing security migrations.

## Findings

### 1. [CRITICAL] Unauthenticated Debug Endpoints in `verifactu-dispatcher`
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function exposes several debug actions (`debug-env`, `debug-test-update`, `debug-last-event`, `debug-aeat-process`) that execute *before* any user authentication or RLS context is established.
- **Impact:**
  - **Credential Leak:** `debug-env` returns the full environment, including `VERIFACTU_CERT_ENC_KEY`.
  - **State Manipulation:** `debug-test-update` allows arbitrary modification of event attempts and error states.
  - **Information Disclosure:** `debug-last-event` exposes internal processing details.
  - Anyone with access to the function URL (and Service Role key or if the function is public) can exploit this. The logic checks `body.action` immediately after `serve`.
- **Recommendation:** Immediately remove these debug endpoints.

### 2. [HIGH] Missing Authorization in `issue-invoice`
- **File:** `supabase/functions/issue-invoice/index.ts`
- **Description:** The function verifies that the invoice exists and is visible to the user (via `invoices` RLS), but it does not strictly verify that the user has the authority (Role: Owner/Admin) to *issue* the invoice.
- **Impact:** If `invoices` RLS allows "Employees" or "Clients" to view invoices (e.g., read-only access), they could theoretically trigger the `issue-invoice` function, submitting the invoice to VeriFactu/AEAT prematurely or maliciously.
- **Recommendation:** Implement a strict check against `public.company_members` to ensure the caller has `owner` or `admin` role for the invoice's company.

### 3. [HIGH] Missing Security Migrations
- **File:** `supabase/migrations/`
- **Description:** Migration files referenced in previous audits (e.g., `20260309120000_secure_products.sql`) are missing from the `supabase/migrations` directory in the current environment.
- **Impact:** Critical tables like `products` or `tickets` may lack RLS if the environment was reset or is out of sync, leaving them exposed to public access.
- **Recommendation:** Verify database state and restore missing migrations immediately.

### 4. [HIGH] Stubbed Logic in `booking-manager`
- **File:** `supabase/functions/booking-manager/index.ts`
- **Description:** The function contains stubbed methods (`checkAvailability`, `createBooking`) that return mock success responses.
- **Impact:** If deployed, this function would allow bookings to be "confirmed" without actually recording them or checking availability, leading to business logic failures.
- **Recommendation:** Implement the logic or disable the function until ready.

### 5. [MEDIUM] Information Disclosure in `verifactu-dispatcher` (`test-cert`)
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The `test-cert` action allows testing certificate validity for a given `company_id`. While it doesn't return the key, it allows enumeration of companies with valid certificates.
- **Recommendation:** Restrict this action to authenticated users who are members of the target company.

## Remediation Plan
1. **Immediate:** Remove debug endpoints from `verifactu-dispatcher`.
2. **Immediate:** Add authorization checks to `issue-invoice`.
3. **Follow-up:** Restore missing migrations and implement `booking-manager`.

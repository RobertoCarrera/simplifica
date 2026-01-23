# Security Audit Report - March 2026

## Executive Summary
This report details the findings of the recurring security audit performed on the "Simplifica" CRM platform. The audit focused on RLS policies, Edge Functions, and financial logic integrity.

Two critical vulnerabilities were identified in the Edge Functions layer, specifically in `verifactu-dispatcher` and `invoices-pdf`, which could allow unauthorized access to sensitive data (IDOR) and potential data leaks via insecure service role usage.

## Findings

### 1. Critical: Unsecured Debug Endpoints in `verifactu-dispatcher`
**Severity:** CRITICAL
**Component:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:**
The `verifactu-dispatcher` function contains several debug endpoints (`debug-env`, `debug-test-update`, `debug-last-event`, `debug-aeat-process`, `diag`) that are accessible to any caller.
- `debug-env`: Leaks environment configuration, including the presence and length of `VERIFACTU_CERT_ENC_KEY`.
- `diag`: Returns sample data from `events` and `invoice_meta` tables for *any* company, bypassing RLS.
- `debug-aeat-process` & `debug-test-update`: Allow triggering operations on arbitrary companies by providing a `company_id` in the request body, without verifying if the caller belongs to that company (IDOR).

**Impact:**
An attacker could view sensitive VeriFactu submission status, hashes, and configuration details of other companies. They could also trigger unauthorized updates to event statuses.

**Remediation:**
Remove all debug endpoints from the production code.

### 2. Critical: IDOR in `test-cert` Action (`verifactu-dispatcher`)
**Severity:** CRITICAL
**Component:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:**
The `test-cert` action accepts a `company_id` in the request body and uses the Service Role (`admin` client) to fetch and decrypt the company's certificate settings to test them. It fails to verify if the authenticated user has permission to access the specified `company_id`.

**Impact:**
Any authenticated user (or unauthenticated if the function is public) can probe the validity of certificates for other companies and potentially infer configuration details.

**Remediation:**
Implement a strict `requireCompanyAccess(company_id)` check that verifies the user's membership in the target company via RLS before processing the request.

### 3. High: Service Role Fallback Bypass in `invoices-pdf`
**Severity:** HIGH
**Component:** `supabase/functions/invoices-pdf/index.ts`
**Description:**
The `invoices-pdf` function implements a fallback mechanism that switches to the Service Role (`admin` client) to fetch `invoice_items` if the user-scoped query returns few or no items.
```typescript
// Fallback: if RLS trimmed items, fetch with service role
if (!itErr && items && items.length <= 1) {
    const { data: adminItems } = await admin...
```
**Impact:**
This logic explicitly bypasses Row Level Security (RLS). If RLS policies were intended to hide certain items (e.g., for multi-tenancy or permission reasons), this fallback defeats that protection, potentially leaking invoice details to unauthorized users who have access to the invoice ID.

**Remediation:**
Remove the Service Role fallback. The PDF generation should strictly respect the data visible to the user context.

## Other Observations
- **Booking Manager:** The `booking-manager` function is currently a stub. Future implementation must ensure that public access to booking types is handled securely (e.g., via specific `TO public` RLS policies or a dedicated Service Role function that sanitizes output), rather than a blanket Service Role usage.
- **RLS Policies:** A review of `bookings`, `resources`, and `booking_types` policies indicates correct multi-tenancy enforcement using `company_members` mapping.

## Proposed Actions
1. Remove debug endpoints and implement `requireCompanyAccess` in `verifactu-dispatcher`.
2. Remove the insecure fallback in `invoices-pdf`.

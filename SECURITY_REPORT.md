# Security Report - Simplifica

## 1. Critical Findings

### 1.1. Unauthenticated AI Resource Access (`ai-request`)
- **Severity:** CRITICAL
- **Location:** `supabase/functions/ai-request/index.ts`
- **Description:** The function checks for the presence of an `Authorization` header but **does not validate the token**. Any request with a dummy header can trigger calls to the Google Generative AI API, leading to potential Denial of Service (DoS) or massive cost injection (exhausting API quotas).
- **Remediation:** Implement `supabaseClient.auth.getUser()` to validate the JWT before processing the request.

### 1.2. Missing RLS on Financial Child Tables
- **Severity:** CRITICAL
- **Location:** Database Tables `public.invoice_items`, `public.quote_items`
- **Description:** While parent tables (`invoices`, `quotes`) have RLS, the child tables containing line items appear to lack RLS policies. Depending on default Postgres/Supabase settings (if `GRANT ALL TO authenticated` exists), this could allow any authenticated user to read/modify line items of any invoice across all companies (IDOR / Data Leakage).
- **Remediation:** Enable RLS on these tables and add policies that strictly link access to the parent table's `company_id`.

## 2. Low Severity Findings

### 2.1. Booking Manager Stub
- **Severity:** LOW
- **Location:** `supabase/functions/booking-manager/index.ts`
- **Description:** The function is a hardcoded stub returning 200 OK. While not a direct exploit, it represents dead code/technical debt that could mislead frontend implementation.
- **Remediation:** Remove or implement properly.

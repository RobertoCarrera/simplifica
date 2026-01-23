# Security Audit Report - March 10, 2026

## Summary
This audit focused on Edge Functions and their authorization mechanisms. Critical vulnerabilities were identified in `verifactu-dispatcher` and `ai-request`, where sensitive operations were exposed without proper authentication or authorization.

## Critical Findings

### 1. Exposed Debug Endpoints in `verifactu-dispatcher`
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function includes several debug actions (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`) that are conditionally executed based on the request body.
- **Vulnerability:** These blocks use the `admin` (Service Role) client to query and modify the database. There are no checks to verify that the requestor is an authenticated user or an admin.
- **Impact:** An attacker could:
  - Modify `verifactu_events` history (e.g., changing status/attempts).
  - view sensitive environment configuration (`debug-env`).
  - Access event data for any company (`debug-last-event`).
- **Remediation:** Remove these debug endpoints entirely or restrict them to authenticated super-admins (if such a concept exists). Given the critical nature of VeriFactu data, removal is recommended.

### 2. Missing Token Validation in `ai-request`
- **File:** `supabase/functions/ai-request/index.ts`
- **Description:** The function checks for the presence of an `Authorization` header (`if (!authHeader)`) but never validates the token with Supabase Auth.
- **Vulnerability:** The function proceeds to initialize the Gemini AI client and generate content regardless of the token's validity.
- **Impact:** Unauthorized usage of the paid Gemini API quota (Financial Resource Exhaustion).
- **Remediation:** Implement `createClient` and call `supabase.auth.getUser()` to validate the session before processing.

## High Severity Findings

### 3. Implicit RLS Reliance in `issue-invoice`
- **File:** `supabase/functions/issue-invoice/index.ts`
- **Description:** The function relies solely on `createClient` passing the user's token to Postgres for RLS enforcement.
- **Risk:** While RLS is the primary defense, Edge Functions should ideally implement defense-in-depth by explicitly validating that the user is a member of the target company (`public.company_members`) before attempting operations, especially when RPCs are involved (which might be improperly defined as `SECURITY DEFINER`).
- **Remediation:** Add an explicit membership check query.

## Informational

### 4. `booking-manager` is a Stub
- **File:** `supabase/functions/booking-manager/index.ts`
- **Status:** The function contains placeholder logic (`checkAvailability`, `createBooking`) returning static responses.
- **Action:** No immediate security risk, but should be monitored as implementation begins.

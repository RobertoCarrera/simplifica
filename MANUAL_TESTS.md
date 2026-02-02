# Manual Test Instructions for Security Fixes

## 1. Verify `payment_integrations` RLS Fix

**Objective:** Ensure that an admin from Company A cannot access payment integrations of Company B.

**Steps:**
1.  **Preparation:**
    -   Log in to the Supabase SQL Editor or use `psql`.
    -   Identify two users from different companies: `UserA` (Company A) and `UserB` (Company B). Ensure both are admins.
    -   Ensure `payment_integrations` table has entries for both Company A and Company B.

2.  **Test Access (Company A):**
    -   Impersonate `UserA`.
    -   Run: `SELECT * FROM payment_integrations;`
    -   **Expected Result:** You should ONLY see records where `company_id` matches Company A.
    -   *If the fix failed:* You would see records from Company B.

3.  **Test Access (Company B):**
    -   Impersonate `UserB`.
    -   Run: `SELECT * FROM payment_integrations;`
    -   **Expected Result:** You should ONLY see records where `company_id` matches Company B.

## 2. Verify `verifactu-dispatcher` Security Fix

**Objective:** Ensure that debug endpoints cannot be used to access other companies' data via IDOR.

**Steps:**
1.  **Preparation:**
    -   Get a valid Bearer token for `UserA` (Company A).
    -   Identify the `company_id` of Company B (`ID_B`).

2.  **Test `debug-last-event` (IDOR Attempt):**
    -   Make a POST request to the `verifactu-dispatcher` function URL.
    -   Headers: `Authorization: Bearer <TOKEN_USER_A>`, `Content-Type: application/json`
    -   Body: `{"action": "debug-last-event", "company_id": "<ID_B>"}`
    -   **Expected Result:** HTTP 403 Forbidden with error `Access denied: Company mismatch` or similar.

3.  **Test `debug-last-event` (Valid Access):**
    -   Body: `{"action": "debug-last-event", "company_id": "<ID_A>"}` (where `ID_A` is UserA's company).
    -   **Expected Result:** HTTP 200 OK (assuming events exist) or HTTP 200 with `null` event.

4.  **Test Removed Endpoints:**
    -   Body: `{"action": "diag"}`
    -   **Expected Result:** The response should NOT contain the diagnostic dump. It might be ignored or return an error depending on the implementation fallback, but it definitely should not return the full environment dump.
    -   Body: `{"action": "debug-env"}`
    -   **Expected Result:** Should not return environment variables.

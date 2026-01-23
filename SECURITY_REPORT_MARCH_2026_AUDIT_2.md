# Security Audit Report - March 2026 (Part 2)

**Date:** March 2026
**Auditor:** Jules (AI Security Engineer)
**Context:** Recurring audit of "Simplifica" CRM.

## Summary
This audit focused on RLS gaps in the data layer and hardcoded secrets in Edge Functions. Three key issues were identified, ranging from Critical to Medium priority.

## Findings

### 1. Hardcoded Encryption Key in `create-payment-link` (CRITICAL)
*   **File:** `supabase/functions/create-payment-link/index.ts`
*   **Issue:** The function uses a hardcoded fallback key (`"default-dev-key-change-in-prod"`) if the `ENCRYPTION_KEY` environment variable is missing.
*   **Risk:** If the environment variable is misconfigured, the system defaults to a known weak key, potentially compromising payment credentials.
*   **Remediation:** Remove the fallback and enforce strict environment variable presence.

### 2. Missing RLS on Invoice/Quote Items (HIGH)
*   **Target:** `invoice_items`, `quote_items` tables.
*   **Issue:** Recent migrations (`20260107...`) secured `invoices` and `quotes` but did not explicitly apply RLS to their line items.
*   **Risk:** An attacker with authenticated access could potentially enumerate line items (products, prices) of other companies by guessing IDs or listing the table, even if they cannot see the parent invoice.
*   **Remediation:** Enable RLS on these tables and add policies that join with the parent table to check `company_members` authorization.

### 3. Missing DOMPurify Configuration (MEDIUM)
*   **File:** `src/app/core/config/dompurify.config.ts`
*   **Issue:** The file is missing from the codebase, despite being referenced in security documentation/memory.
*   **Risk:** The frontend may be vulnerable to Reverse Tabnabbing or XSS if `target="_blank"` links are not properly sanitized or if DOMPurify hooks are not active.
*   **Remediation:** Re-implement the configuration or locate the correct file path.

### 4. Unimplemented Booking Logic (INFO)
*   **File:** `supabase/functions/booking-manager/index.ts`
*   **Issue:** The function exists as a stub with no implementation.
*   **Risk:** Low security risk, but represents technical debt/broken functionality.

## Action Plan
1.  **Immediate Fix:** Secure `create-payment-link` by removing the insecure fallback.
2.  **Immediate Fix:** Apply RLS to `invoice_items` and `quote_items`.
3.  **Future:** Re-implement DOMPurify config.

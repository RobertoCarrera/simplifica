# Security Audit Report - Simplifica CRM

**Date:** 2024-05-22
**Auditor:** Jules (Senior Security Engineer)

## Summary

This audit focused on RLS policies, Edge Functions, and financial logic. Two high-impact issues were identified requiring immediate attention.

## Findings

### 1. [CRITICAL] Deprecated Authorization Source in `convert_quote_to_invoice`

*   **Location:** `supabase/migrations/20260129160000_finance_security_logic.sql` (Function: `convert_quote_to_invoice`)
*   **Description:** The function authorizes staff users by checking `public.users.company_id`. This column is deprecated and has been replaced by the `public.company_members` table (many-to-many relationship).
*   **Risk:** If `public.users.company_id` is null or stale, legitimate users might be denied access, or worse, if it contains an old company ID, a user might retain access to a company they were removed from (if they were removed from `company_members` but the `users` table wasn't updated).
*   **Recommendation:** Update the function to verify membership via `public.company_members` with `status = 'active'`.

### 2. [HIGH] Data Leak in `invoices-pdf` Edge Function

*   **Location:** `supabase/functions/invoices-pdf/index.ts`
*   **Description:** The function generates QR codes for VeriFactu by calling an external API (`api.qrserver.com`), sending sensitive invoice data (NIF, Amount, Date, Hash) in the URL query parameters.
*   **Risk:** Privacy violation. Sensitive financial data is exposed to a third-party service not controlled by the organization.
*   **Recommendation:** Use the `qrcode-generator` library (already imported) to generate the QR code locally within the Edge Function.

### 3. [MEDIUM] Potential RLS Bypass in `invoices-pdf` Fallback

*   **Location:** `supabase/functions/invoices-pdf/index.ts`
*   **Description:** The function has a fallback mechanism that fetches `invoice_items` using the `admin` (service role) client if the user-scoped query returns 0 or 1 item.
*   **Risk:** While the invoice itself is checked against RLS, this fallback theoretically allows retrieving items that RLS might have hidden. It complicates the security model.
*   **Recommendation:** Rely solely on RLS. If items are missing, it should be investigated why, rather than bypassing security controls. (Note: Not addressed in this immediate fix cycle, but flagged).

### 4. [MEDIUM] `DOMPurify` Hook Missing in `app.config.ts`

*   **Location:** `src/app/app.config.ts`
*   **Description:** Memory indicates a global `DOMPurify` hook for Reverse Tabnabbing protection should be present, but it was not found in the file.
*   **Risk:** Potential exposure to reverse tabnabbing attacks if user content contains `target="_blank"` links without `rel="noopener noreferrer"`.
*   **Recommendation:** Re-implement the `DOMPurify` hook.

## Action Plan

We will proceed to fix findings #1 and #2 immediately as they represent the highest risk and concrete implementation flaws.

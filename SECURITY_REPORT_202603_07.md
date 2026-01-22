# Security Audit Report (2026-03-07)

## Executive Summary
This audit focused on the `verifactu` module, Edge Functions, and RLS integrity. Critical vulnerabilities were identified regarding missing explicit RLS on sensitive certificate storage tables and the usage of deprecated database columns for authorization in Edge Functions.

## Findings

### 1. Missing RLS on VeriFactu Settings (CRITICAL)
*   **Target:** `public.verifactu_settings`, `public.verifactu_cert_history`
*   **Status:** No explicit RLS policies were found in the migration history for these tables.
*   **Risk:** If RLS is not enabled, these tables (containing encrypted certificates and keys) might be accessible by any authenticated user, leading to potential cross-tenant data leakage. Even with encryption, access control must be strict.
*   **Remediation:** Create a migration to strictly enable RLS and add policies limiting access to `owner` and `admin` roles of the respective `company_id`.

### 2. Usage of Deprecated Authorization Columns (HIGH)
*   **Target:** `supabase/functions/upload-verifactu-cert/index.ts`
*   **Status:** The function queries `public.users.company_id` and `public.users.role`.
*   **Risk:** The architecture has migrated to `public.company_members`. The `users` table columns are deprecated and may be null or out of sync, leading to authorization bypasses or denial of service for valid users in the new multi-tenant model.
*   **Remediation:** Refactor the function to query `public.company_members` to resolve company association and role.

### 3. Weak Authorization in Analytics Function (HIGH)
*   **Target:** `supabase/functions/top-products/index.ts`
*   **Status:** The function retrieves `company_id` from `public.users`.
*   **Risk:** Similar to finding #2, it relies on deprecated schema. Additionally, it processes invoices in memory which may have performance implications, though the immediate security risk is the schema dependency.
*   **Remediation:** Update to use `company_members`. (Out of scope for this immediate fix, prioritizing #2).

### 4. Booking Manager Stub (LOW)
*   **Target:** `supabase/functions/booking-manager/index.ts`
*   **Status:** The function contains stub implementations returning empty/success responses.
*   **Risk:** Low, but represents technical debt and potential confusion.
*   **Remediation:** Remove or implement properly.

## Plan of Action
1.  **Immediate Fix:** Apply RLS to `verifactu_settings` and `verifactu_cert_history`.
2.  **Immediate Fix:** Refactor `upload-verifactu-cert` to use `company_members`.

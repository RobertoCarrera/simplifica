# Security Audit Report - Simplifica CRM
**Date:** May 2026
**Auditor:** Jules (AI Security Engineer)

## Executive Summary
A critical architectural flaw was detected in the Row Level Security (RLS) implementation. The current policies compare `public.users.id` directly with `auth.uid()`, but these columns contain distinct UUIDs. This results in a "Deny All" state for legitimate users, breaking the application's multi-tenancy access. Additionally, file synchronization issues have caused the regression of previously secured child tables (`invoice_items`), leaving them potentially unprotected or relying on "implicit" security.

## Findings

### 1. [CRITICAL] Broken RLS Authorization (UUID Mismatch)
*   **Description:** The RLS policies for `company_members`, `invoices`, and `quotes` use the condition `user_id = auth.uid()` (or similar lookups).
    *   `auth.uid()` returns the UUID from Supabase Auth (`auth.users`).
    *   `public.company_members.user_id` refers to `public.users.id`.
    *   The `public.users` table is separate and has its own UUID PK, linked to Auth via `auth_user_id`.
*   **Impact:** Legitimate users cannot access their own company data, invoices, or quotes. The application is effectively non-functional for standard users. If a migration ever syncs these IDs (unlikely), it would be accidental.
*   **Affected Files:**
    *   `supabase/migrations/20260107020000_create_company_members.sql`
    *   `supabase/migrations/20260107022000_update_rls_invoices_quotes.sql`
    *   `supabase/migrations/20260129160000_finance_security_logic.sql`
*   **Remediation:** Policies must JOIN `public.users` to map `auth.uid()` to `public.users.id`.

### 2. [HIGH] Missing RLS on Sensitive Child Tables
*   **Description:** Due to a known file synchronization regression, the migration `20260501000000_secure_child_tables.sql` is missing.
*   **Impact:** Tables such as `invoice_items` and `quote_items` likely have no active RLS policies or default to "Deny All" (if enabled) or "Allow All" (if disabled).
*   **Evidence:** `invoices-pdf` Edge Function contains a fallback block that explicitly bypasses RLS to fetch `invoice_items` using `service_role_key`, suggesting developers encountered access issues here.
*   **Remediation:** Re-implement RLS policies for child tables using JOINs to their parent tables (e.g., check `invoices.company_id` for `invoice_items`).

### 3. [MEDIUM] Insecure Fallback in Edge Functions
*   **Description:** `supabase/functions/invoices-pdf/index.ts` uses `service_role_key` to fetch `invoice_items` if the user-scoped query returns few results.
*   **Impact:** Masking of RLS failures. If `invoice_items` RLS is fixed/enforced, this function might still bypass it if the user query fails for legitimate reasons (e.g., partial permissions).
*   **Remediation:** Remove the service role fallback once RLS is fixed. Trust the database security layer.

### 4. [MEDIUM] Legacy Authorization Logic in RPC
*   **Description:** The function `convert_quote_to_invoice` checks `users.company_id` instead of verifying active membership in `company_members`.
*   **Impact:** Potential security bypass if a user is removed from `company_members` but the denormalized `users.company_id` is not cleared.
*   **Remediation:** Update the RPC to query `company_members` explicitly.

## Proposed Action Plan
1.  **Immediate Fix:** Create a remediation migration that:
    *   Drops broken policies.
    *   Recreates policies for `company_members` using correct `auth_user_id` lookup.
    *   Implements RLS for `invoice_items` and `quote_items` (Parent-JOIN).
    *   Updates `invoices` and `quotes` policies to use the correct user lookup.
2.  **Code Cleanup:** Update `invoices-pdf` to remove the insecure fallback.

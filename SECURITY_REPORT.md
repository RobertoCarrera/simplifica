# Security Audit Report - May 2026

## Executive Summary
This report details the findings of a security audit performed on the "Simplifica" CRM. The audit focused on RLS policies, Edge Functions, and Multi-tenancy architecture.

**Critical vulnerabilities were identified** involving RLS bypasses in Edge Functions and missing policies on child tables. High-risk issues involving deprecated data patterns were also found.

## Findings

### 1. CRITICAL: Insecure Fallback in `invoices-pdf` Edge Function
*   **Location:** `supabase/functions/invoices-pdf/index.ts`
*   **Issue:** The function attempts to fetch invoice items using the user's token (RLS). If it retrieves 0 or 1 items, it automatically retries using the `service_role` client (Admin).
*   **Risk:** This effectively masks broken or missing RLS policies. If a user has access to an invoice header but *should not* see the items (e.g., due to restrictive RLS), this function bypasses that restriction and leaks the data in the generated PDF. It effectively nullifies RLS on `invoice_items` for PDF generation.
*   **Remediation:** Remove the `service_role` fallback. Fix the underlying RLS policies if they are too restrictive.

### 2. CRITICAL: Missing RLS on `invoice_items`
*   **Location:** Database Schema
*   **Issue:** The `invoice_items` table appears to lack explicit RLS policies in the migration history (specifically `20260107022000_update_rls_invoices_quotes.sql` covered invoices but not items).
*   **Risk:** Without explicit policies, `invoice_items` either defaults to "deny all" (breaking the app) or "allow all" (if RLS is not enabled), depending on the exact state. Combined with finding #1, this suggests a fragile security state.
*   **Remediation:** Enable RLS on `invoice_items` and add policies that inherit permissions from the parent `invoices` table.

### 3. HIGH: Deprecated `company_id` usage in `verifactu-dispatcher`
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts` (Action: `list-registry`)
*   **Issue:** The function determines the user's company by querying `public.users.company_id`.
*   **Risk:** This column is deprecated and insecure for multi-tenancy. It allows for potential IDOR or context confusion if a user belongs to multiple companies (or no active company). It does not verify *active* membership status.
*   **Remediation:** Resolve `company_id` via `public.company_members` table, ensuring `status = 'active'`.

### 4. HIGH: Deprecated `company_id` usage in `convert_quote_to_invoice`
*   **Location:** `supabase/migrations/20260129160000_finance_security_logic.sql`
*   **Issue:** The RPC function selects `company_id` from `public.users`.
*   **Risk:** Same as #3. A user removed from `company_members` but retaining a stale `company_id` in `users` could still perform operations.
*   **Remediation:** Update the PL/pgSQL function to join against `company_members`.

### 5. MEDIUM: Unimplemented `booking-manager` Stub
*   **Location:** `supabase/functions/booking-manager/index.ts`
*   **Issue:** The function is a stub that returns success (`{ success: true }`) for booking actions without performing them.
*   **Risk:** Business logic failure. Users might think they made a booking when they didn't.
*   **Remediation:** Implement the logic or return `501 Not Implemented`.

## Next Steps
Immediate remediation will be applied to findings #1, #2, and #3 via Pull Requests.

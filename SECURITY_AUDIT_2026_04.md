# Security Audit Report - April 2026

## Executive Summary
This audit focused on RLS policies, Edge Functions, and multi-tenancy boundaries. A critical vulnerability was identified in the tagging system (`item_tags`) that allows cross-tenant data access.

## Findings

### 1. [CRITICAL] Global Access to `item_tags`
*   **Location:** `supabase/migrations/20260106110000_unified_tags_schema.sql`
*   **Risk:** The RLS policies for `item_tags` are defined as `USING (true)` and `WITH CHECK (true)` for all authenticated users.
*   **Impact:** Any logged-in user (Employee, Client, Owner) can query **all tags** for **all companies**. They can also tag records belonging to other companies.
*   **Remediation:**
    *   Add `company_id` to `item_tags`.
    *   Backfill existing data.
    *   Replace policies with strict `company_id` checks against the user's profile.

### 2. [HIGH] Potential RLS Gaps in Ticket Line Items
*   **Location:** `ticket_services`, `ticket_products` (inferred from `client-create-ticket` logic).
*   **Risk:** The Edge Function `client-create-ticket` contains fallback logic for when `company_id` is missing or when `price_per_unit` columns are undefined. This suggests inconsistent schema definition and likely missing RLS on these child tables.
*   **Impact:** If RLS is missing, line items might be exposed globally or modifiable by unauthorized users.
*   **Remediation:** Standardize the schema to include `company_id` and enforce RLS.

### 3. [MEDIUM] Unimplemented Logic in `booking-manager`
*   **Location:** `supabase/functions/booking-manager/index.ts`
*   **Risk:** The function is a Stub (`// Stub`).
*   **Impact:** Low current risk, but if deployed/enabled without proper RLS checks in the future implementation, it will be an IDOR vector.
*   **Remediation:** Ensure future implementation uses `requireInvoiceAccess` or similar `company_id` validation patterns.

### 4. [INFO] Secure Implementation in `issue-invoice`
*   **Location:** `supabase/functions/issue-invoice/index.ts`
*   **Status:** Secure.
*   **Notes:** The function correctly checks `invoices` existence using the user's `Authorization` header, leveraging RLS to prevent IDOR.

## Next Steps
1.  **Immediate:** Apply RLS fix for `item_tags` (Planned for this iteration).
2.  **Follow-up:** Investigate and standardize `ticket_services` / `ticket_products` schema.

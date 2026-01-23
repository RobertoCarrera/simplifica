# Security Audit Report - April 2026

**Auditor:** Jules (Senior Security Engineer)
**Date:** April 01, 2026
**Scope:** RLS Policies, Edge Functions, Financial Logic

## Executive Summary
A recurrent audit of the "Simplifica" CRM repository identified significant security regressions due to missing migration files from the March 2026 cycle. Critical vulnerabilities were found in the data layer (missing RLS on child tables) and Edge Functions (IDOR and Auth Bypass).

## Findings

### 1. [CRITICAL] Missing RLS on Financial Child Tables
*   **Component:** PostgreSQL Database (`invoice_items`, `quote_items`)
*   **Description:** The migration `20260320000000_secure_invoice_items.sql` is missing from the codebase. Review of the schema implies that `invoice_items` and `quote_items` either have no RLS enabled or default to permissive policies.
*   **Risk:** An authenticated user (or compromised token) could potentially list **all** invoice items across **all companies** by querying the `invoice_items` table directly, bypassing the RLS on the parent `invoices` table.
*   **Remediation:** Create a new migration to explicitly `ENABLE ROW LEVEL SECURITY` and add policies checking `company_members` via a join on the parent table.

### 2. [CRITICAL] IDOR in `client-create-ticket` Edge Function
*   **Component:** `supabase/functions/client-create-ticket/index.ts`
*   **Description:** The function accepts `p_company_id` and correctly checks if the client belongs to it. However, when fetching `services`, `products`, and `ticket_stages` by ID, it **fails to filter by `company_id`**.
*   **Risk:** A malicious actor in Company A can find valid UUIDs for products/services in Company B (e.g., via brute force or leakage) and inject them into Company A's tickets. This causes data leakage (pricing exposure) and data integrity issues.
*   **Remediation:** Enforce `.eq('company_id', payload.company_id)` on all DB lookups within the function.

### 3. [HIGH] Authentication Bypass in `ai-request`
*   **Component:** `supabase/functions/ai-request/index.ts`
*   **Description:** The function checks for the presence of an `Authorization` header but **does not validate the token** against Supabase Auth (`supabase.auth.getUser()`).
*   **Risk:** Unauthenticated attackers can invoke the function with any string in the Authorization header, consuming the project's Gemini AI quota and potentially incurring costs or DoS.
*   **Remediation:** Implement `supabase.auth.getUser(token)` and verify the user is active.

### 4. [LOW] Unimplemented Logic in `booking-manager`
*   **Component:** `supabase/functions/booking-manager/index.ts`
*   **Description:** The function is a stub returning mock responses.
*   **Risk:** Low, but represents "dead code" that could be confusing or accidentally enabled.
*   **Remediation:** Remove or implement properly with security controls.

## Planned Actions
This audit session will address the two most critical issues:
1.  **Fix IDOR in `client-create-ticket`**: Patching the Edge Function.
2.  **Secure `invoice_items`**: Adding a missing RLS migration.

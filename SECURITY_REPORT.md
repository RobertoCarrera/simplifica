# Security Audit Report - Simplifica

**Date:** 2028-10-27
**Auditor:** Jules (Security Engineer)

## Summary
This audit focused on RLS policies, multi-tenancy enforcement, and Edge Function security. Three key findings were identified, ranging from Critical to Medium severity.

## Findings

### 1. [CRITICAL] Missing `company_id` in `integrations` table
- **File:** `supabase/migrations/20260110210000_create_booking_system.sql`
- **Description:** The `integrations` table (used for Google Calendar tokens) lacks a `company_id` column. RLS currently relies solely on `user_id`.
- **Risk:**
    - **Data Leakage:** Integrations are not strictly bound to a company tenant. If a user moves between companies or if an employee leaves, the integration might persist ambiguously or be accessible in the wrong context.
    - **Inconsistent Multi-tenancy:** Violates the architectural requirement that all tenant data must be scoped by `company_id`.
- **Recommendation:** Add `company_id` column, backfill existing data, and enforce RLS policies that check `company_members`.

### 2. [HIGH] Deprecated Authentication Logic in `verifactu-dispatcher`
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The `list-registry` action queries `public.users.company_id` to determine the user's company.
- **Risk:**
    - **Authorization Failure:** The `public.users.company_id` column is deprecated and may be null or stale. Authorization must rely on the `company_members` table to ensure the user actually has active access to the company.
- **Recommendation:** Refactor the logic to query `company_members` to resolve the active company context for the user.

### 3. [MEDIUM] Nested Helper Functions in Edge Functions
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The `requireInvoiceAccess` helper function is defined inside the `serve` handler.
- **Risk:**
    - **Maintainability & Scope Issues:** Violates coding conventions. Nested functions can inadvertently capture closure state, leading to unpredictable behavior or memory leaks in long-running contexts (though Edge Functions are ephemeral, it's bad practice).
- **Recommendation:** Move helper functions to the top level and explicitly pass dependencies.

## Planned Actions
1.  **PR 1:** Fix `integrations` table schema and RLS (Critical).
2.  **PR 2:** Refactor `verifactu-dispatcher` auth logic and code structure (High/Medium).

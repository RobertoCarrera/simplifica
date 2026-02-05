# Security Report - March 2026 (Recurrent Audit V2)

**Date:** 2026-03-25
**Auditor:** Jules (AI Security Engineer)
**Scope:** RLS, Edge Functions, Finance Logic, Frontend Config.

## Executive Summary
A critical IDOR/Privilege Escalation vulnerability was identified in the `verifactu-dispatcher` Edge Function, allowing arbitrary access to sensitive tax data and environment variables. Additionally, the `products` table lacks RLS policies, and `client-create-ticket` has logic gaps allowing cross-tenant product references.

## Findings

### 1. [CRITICAL] Unsecured Debug Endpoints in `verifactu-dispatcher`
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function exposes several "debug" actions (`diag`, `debug-env`, `debug-aeat-process`, `debug-test-update`) that bypass authentication and authorization checks.
- **Impact:**
  - **Information Disclosure:** `debug-env` exposes environment variables. `debug-aeat-process` exposes certificate details and NIFs.
  - **IDOR:** `debug-aeat-process` and `debug-last-event` accept a `company_id` in the body and use the `admin` (Service Role) client to fetch data, allowing an attacker to dump data for any company.
  - **Integrity:** `debug-test-update` allows modifying event attempt counts and errors.
- **Recommendation:** Remove these endpoints immediately.

### 2. [HIGH] Missing RLS on `products` Table
- **File:** Database Schema (`public.products`)
- **Description:** No migration was found enabling RLS on the `products` table.
- **Impact:** If RLS is not enabled, any authenticated user (or public if anon key is used) might be able to read/modify products depending on default Postgres privileges.
- **Recommendation:** Enable RLS and enforce `company_members` checks.

### 3. [HIGH] Cross-Tenant Reference in `client-create-ticket`
- **File:** `supabase/functions/client-create-ticket/index.ts`
- **Description:** The function accepts `p_products` (list of IDs) and queries them using `supabaseAdmin`. While it checks if the ID *exists*, it does **not** verify that the product belongs to the `p_company_id` of the ticket.
- **Impact:** A client could inject a product ID from another company into their ticket.
- **Recommendation:** Add `.eq('company_id', payload.company_id)` to the product/service lookup queries.

### 4. [MEDIUM] Stubbed/Incomplete Components
- **File:** `supabase/functions/booking-manager/index.ts`
- **Description:** The function contains stubbed methods returning empty responses.
- **Recommendation:** Ensure this is not deployed to production until implemented, or verified that it causes no confusion.

### 5. [MEDIUM] Missing/Inaccessible File
- **File:** `supabase/functions/generate-embedding`
- **Description:** The directory is listed but file reading fails.
- **Recommendation:** Investigate file system or deployment state.

## Planned Remediation
1. Remove debug endpoints from `verifactu-dispatcher`.
2. Implement RLS for `products`.

# Security Audit Report - Simplifica

**Date:** May 2026
**Auditor:** Jules (AI Security Engineer)

## Summary
This audit focused on RLS policies, Edge Functions security, and multi-tenancy isolation. Three critical vulnerabilities were identified requiring immediate attention.

## Findings

### 1. Missing RLS on Financial Child Tables (CRITICAL)
**Affected Resources:** `public.invoice_items`, `public.quote_items`
**Description:**
Analysis of migrations indicates that while `invoices` and `quotes` tables have RLS policies, their child tables (`invoice_items`, `quote_items`) likely lack Row Level Security policies. These tables do not contain a `company_id` column, requiring policies that JOIN with their parent tables to enforce access control.
**Impact:**
If RLS is disabled or missing on these tables, any authenticated user (including Clients or users from other companies) could potentially read, modify, or delete line items of *any* invoice in the system via the REST API, bypassing the protections on the parent `invoices` table.

### 2. IDOR and Information Disclosure in `verifactu-dispatcher` (CRITICAL)
**Affected Resource:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:**
The function exposes several unauthenticated debug endpoints (`debug-aeat-process`, `debug-last-event`, `debug-test-update`) and a `test-cert` endpoint. These endpoints:
1.  Do not verify the caller's identity or permissions.
2.  Accept `company_id` as an input parameter.
3.  Use the `SUPABASE_SERVICE_ROLE_KEY` (admin) to fetch data.
**Impact:**
An attacker can invoke these endpoints to:
-   Retrieve sensitive tax certificate details (NIF, issuer name, environment) and event logs for *any* company.
-   Trigger test updates on tax events.
-   Probe the existence and configuration of other companies.

### 3. Insecure Service Role Fallback in `invoices-pdf` (HIGH)
**Affected Resource:** `supabase/functions/invoices-pdf/index.ts`
**Description:**
The function attempts to fetch invoice items using the user's context. If that fails or returns "too few" items (implied logic for RLS filtering), it falls back to fetching items using the `admin` client (Service Role).
**Impact:**
This explicitly bypasses RLS. If RLS policies are meant to restrict access to certain items, this function negates that protection. Combined with Finding #1, it confirms a systemic issue with child table access.

## Proposed Remediation Plan

1.  **Immediate Fix (PR 1):** Implement strict RLS policies for `invoice_items` and `quote_items` that enforce tenancy via their parent tables.
2.  **Immediate Fix (PR 2):** Remove debug endpoints from `verifactu-dispatcher` and implement strict `requireCompanyAccess` checks for the `test-cert` action.
3.  **Follow-up (Next Cycle):** Refactor `invoices-pdf` to remove the service role fallback and handle RLS errors gracefully.

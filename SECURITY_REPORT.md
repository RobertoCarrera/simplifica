# Security Audit Report - Feb 2026

**Date:** Feb 2026
**Auditor:** Jules (Senior Security Engineer)
**Scope:** RLS, Edge Functions, Finance Logic, Frontend/Auth

## Executive Summary
This audit identified **2 Critical** and **1 High** severity issues. The most significant risks involve IDOR vulnerabilities in the `verifactu-dispatcher` edge function allowing unauthorized access to VeriFactu operations, and a legacy single-tenant assumption in the invoicing logic that compromises multi-tenant security.

## Findings

### 1. [CRITICAL] IDOR in `verifactu-dispatcher` Debug Endpoints
- **Description:** Several debug and testing endpoints (`debug-aeat-process`, `test-cert`, `debug-test-update`, `debug-last-event`) in `supabase/functions/verifactu-dispatcher/index.ts` accept a `company_id` in the request body and perform operations using the `service_role_key` without verifying that the caller is a member of that company.
- **Impact:** Any authenticated user (or anyone with the URL if `ALLOW_ALL_ORIGINS` is loose) can trigger AEAT submissions, view certificate status, or modify event logs for *any* company by guessing or knowing their `company_id`.
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Remediation:** Implement a `requireCompanyAccess(company_id)` helper that validates the user's token against `public.company_members` before allowing these actions.

### 2. [HIGH] Insecure Multi-tenancy in `convert_quote_to_invoice`
- **Description:** The RPC function `convert_quote_to_invoice` relies on `public.users.company_id` to validate if a staff member belongs to the same company as the quote. The `company_id` column on `users` is deprecated and does not support users belonging to multiple companies (multi-tenancy).
- **Impact:** If a user belongs to multiple companies (via `company_members`), the system may incorrectly deny access or, worse, rely on a stale/manipulable field (`users.company_id`) rather than the authoritative `company_members` table.
- **Location:** `supabase/migrations/20260129160000_finance_security_logic.sql`
- **Remediation:** Update the function to check `public.company_members` using `public.get_my_public_id()` to verify the user is an active member of the quote's company.

### 3. [MEDIUM] RLS Bypass in `invoices-pdf`
- **Description:** The `invoices-pdf` function uses a fallback mechanism where, if RLS returns 0 or 1 invoice items, it re-queries using the `admin` (service role) client.
- **Impact:** While the function first validates access to the *invoice* via RLS, bypassing RLS for *items* could theoretically expose data if row-level access rules for items differ from invoices (e.g., hidden line items).
- **Location:** `supabase/functions/invoices-pdf/index.ts`
- **Remediation:** Ensure RLS policies for `invoice_items` are consistent with `invoices` so the fallback is unnecessary.

### 4. [INFO] RLS Recursion Fix Confirmed
- **Description:** Historical issues with RLS recursion and `auth.uid()` vs `public.users.id` mismatch appear to be resolved by the introduction of `public.get_my_public_id()` and non-recursive policies in `20260111040000_fix_rls_recursion_public_id.sql`.

## Planned Actions
1. Fix `verifactu-dispatcher` IDOR immediately.
2. Update `convert_quote_to_invoice` via new migration.

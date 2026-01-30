# Security Audit Report - October 2028

**Auditor:** Security Agent (Jules)
**Date:** 2028-10-24
**Scope:** RLS, Edge Functions, Financial Logic, Frontend/Auth

## Summary

The audit identified **3 key findings**: 1 Critical, 2 High.
Immediate action is required for `aws-manager` (Unauthenticated RCE) and `verifactu-dispatcher` (Debug Backdoors).

## Findings

### 1. [CRITICAL] Unauthenticated Access in `aws-manager` Edge Function

- **File:** `supabase/functions/aws-manager/index.ts`
- **Description:** The function directly processes `action` and `payload` from the request body without checking for an `Authorization` header or validating the user session. It instantiates AWS clients and executes operations based solely on input.
- **Impact:** Unauthenticated Remote Code Execution / IDOR. Any user (or bot) with the function URL can check domain availability or register domains (incurring costs) using the server's AWS credentials.
- **Remediation:** Enforce Supabase Auth. Instantiate `SupabaseClient` with the user's token and call `auth.getUser()` before processing.

### 2. [HIGH] Insecure Debug Endpoints in `verifactu-dispatcher`

- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function contains several debug actions (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`, `diag`) that are accessible to authenticated users (and possibly unauthenticated if not careful, though the client creation suggests service role use). These endpoints expose internal environment variables (keys, config) and allow arbitrary modification of `verifactu.events` (resetting attempts, changing status).
- **Impact:** Information Disclosure (Env vars) and Data Integrity violation (modifying fiscal event states).
- **Remediation:** Remove all debug code blocks.

### 3. [HIGH] Missing Multi-Tenancy Enforcement in `integrations` Table

- **File:** `supabase/migrations/20260110210000_create_booking_system.sql`
- **Description:** The `public.integrations` table has a `user_id` but lacks a `company_id`. RLS policies rely solely on `auth.uid()`.
- **Impact:** Weak Multi-Tenancy. If a user belongs to multiple companies, their integrations (e.g., Google Calendar tokens) are not scoped to the specific company they are operating in. This could lead to data leakage between companies (e.g., Company A seeing Company B's calendar events if the same user is in both).
- **Remediation:** Add `company_id` column, backfill data, and update RLS policies to enforce `company_id` checks via `company_members`.

## Other Notes

- `issue-invoice`, `booking-manager`, and `invoices-pdf` appear to correctly implement Auth checks.
- `verifactu-dispatcher` uses `// @ts-nocheck` which hides potential type safety issues.

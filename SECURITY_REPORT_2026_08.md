# SECURITY REPORT - August 2026 Audit

**Auditor:** Jules (AI Security Engineer)
**Date:** 2026-08-01
**Scope:** RLS Policies, Edge Functions, Multi-tenancy Architecture

## Executive Summary
A critical security audit revealed significant vulnerabilities in the `verifactu-dispatcher` Edge Function (IDOR) and the core RLS implementation for multi-tenancy (`company_members`). Additionally, several sensitive tables lack RLS protection due to missing migrations.

## Critical Findings

### 1. IDOR in `verifactu-dispatcher` Debug Endpoints
**Severity:** CRITICAL
**Affected Component:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:**
The Edge Function exposes several "debug" actions (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) that accept a `company_id` in the request body and perform administrative actions using the `SUPABASE_SERVICE_ROLE_KEY`. These endpoints **do not verify** if the authenticated user belongs to the requested `company_id`.
**Impact:**
Any authenticated user (or anyone knowing the URL structure) can:
- Trigger fake updates to VeriFactu events for any company.
- View sensitive VeriFactu event logs for any company.
- Test and retrieve partial certificate details for any company.
**Remediation:**
Remove debug endpoints in production or strictly secure them with `requireCompanyAccess`.

### 2. Broken RLS on `company_members` (UUID Mismatch)
**Severity:** CRITICAL
**Affected Component:** `public.company_members` (RLS Policies)
**Description:**
Current RLS policies compare `user_id` (a UUID from `public.users`) directly with `auth.uid()` (a UUID from `auth.users`).
`user_id = auth.uid()`
Since `public.users.id` and `auth.users.id` are distinct (linked via `public.users.auth_user_id`), this comparison is always FALSE (or incorrect).
**Impact:**
Users may be unable to access their own company data (Denial of Service), or if IDs coincidently match, access wrong data. This fundamentally breaks the multi-tenant isolation logic dependent on `company_members`.
**Remediation:**
Update policies to join `public.users` or use a subquery: `user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())`.

### 3. Missing RLS on Sensitive Child Tables
**Severity:** CRITICAL
**Affected Component:** `invoice_items`, `quote_items`, `verifactu_settings`, `payment_integrations`
**Description:**
These tables appear to lack active RLS policies (or are relying on defaults which might be "allow all" or "deny all"). Specifically, `invoice_items` contains financial line-item data and should be restricted to company members.
**Impact:**
Potential data leakage of invoice details or configuration secrets if RLS is not explicitly enforcing `company_id` checks.
**Remediation:**
Enable RLS and add policies that check `company_members` (either directly or via parent table joins).

## High Findings

### 4. `retry` Action in `verifactu-dispatcher` Unsecured
**Severity:** HIGH
**Description:**
The `retry` action accepts an `invoice_id` and resets its VeriFactu status using the admin client. It does not check if the caller has access to that invoice.
**Remediation:**
Implement `requireInvoiceAccess(invoice_id)` check.

## Proposed Actions
1.  **Immediate Migration:** Fix `company_members` RLS and secure child tables (`20260801000000_audit_security_fixes.sql`).
2.  **Code Fix:** Refactor `verifactu-dispatcher` to remove dangerous debug endpoints and enforce authorization on remaining actions.

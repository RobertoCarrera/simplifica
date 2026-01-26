# Security Audit Report - December 2026

**Date:** December 1, 2026
**Auditor:** AI Security Engineer
**Scope:** Recurring audit of RLS, Edge Functions, and Financial Logic.

## Executive Summary
The audit has identified **CRITICAL** vulnerabilities resulting from a significant environment regression. The codebase appears to have reverted to a January 2026 state, effectively undoing months of security patches (February–November 2026). This has re-exposed critical IDOR vulnerabilities and left sensitive financial data unprotected.

## Findings

### 1. [CRITICAL] IDOR in `verifactu-dispatcher` Debug Endpoints
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Vulnerability:** Several debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) accept a `company_id` in the request body and execute database operations using the `admin` (Service Role) client without validating if the requesting user belongs to that company.
- **Impact:** Any authenticated user (or anyone knowing the URL if CORS is open) can view verifactu events, test certificates, and potentially trigger submission loops for *any* company in the system.
- **Remediation:** Implement `requireCompanyAccess(company_id)` to validate membership via RLS before processing these requests.

### 2. [CRITICAL] Missing RLS on Financial Child Tables
- **Files:** Database Schema (`invoice_items`, `quote_items`)
- **Vulnerability:** While `invoices` and `quotes` have RLS policies (re-introduced in `20260129160000_finance_security_logic.sql`), the child tables `invoice_items` and `quote_items` do not appear to have Row Level Security enabled or enforced in the current migration history.
- **Impact:** A malicious actor could potentially enumerate, read, or modify line items (prices, quantities) of other companies' invoices by guessing UUIDs, bypassing the company isolation.
- **Remediation:** Apply RLS to these tables with policies that `JOIN` the parent table to verify access via `company_members`.

### 3. [CRITICAL] Unauthenticated Access in `aws-manager`
- **File:** `supabase/functions/aws-manager/index.ts`
- **Vulnerability:** The function processes requests immediately without verifying the `Authorization` header or identifying the user.
- **Impact:** Public access to domain registration and availability checks using the platform's AWS credentials. This could lead to financial resource exhaustion (Denial of Wallet).
- **Remediation:** Implement Supabase Auth checks to ensure only authorized admins can trigger these actions.

### 4. [HIGH] UUID Mismatch Risk in Legacy Policies
- **Context:** The environment uses `public.users` (linked to `auth.users`).
- **Vulnerability:** Previous audits noted a recurring issue where policies incorrectly compared `auth.uid()` directly to columns expecting `public.users.id`.
- **Status:** The `20260129...` migration seems to handle this correctly for `invoices`, but this pattern must be strictly enforced in all new remediation.

## Action Plan
This report covers the immediate remediation of:
1.  **RLS Security:** Securing `invoice_items` and `quote_items`.
2.  **Edge Function Security:** Patching `verifactu-dispatcher` IDOR.

*Note: `aws-manager` requires remediation but is secondary to the tax/financial data risks in this sprint.*

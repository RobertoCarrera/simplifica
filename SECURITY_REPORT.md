# Security Audit Report - Simplifica CRM
**Date:** January 30, 2028
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A recurring security audit has identified critical vulnerabilities resulting from a system regression to a Jan 2026 state. Critical protections for multi-tenant data isolation (RLS) and Edge Function authorization have been lost and must be restored immediately.

## Findings

### 1. Missing RLS on Child Tables (CRITICAL)
- **Files:** `supabase/migrations/*` (missing policies for `invoice_items`, `quote_items`)
- **Impact:** Any authenticated user can potentially access or modify line items of invoices and quotes from other companies if they guess the IDs, bypassing the parent table's RLS.
- **Status:** **REGRESSION**. These policies existed in Nov 2027 but are missing in the current file set.

### 2. Unauthenticated AWS Operations (CRITICAL)
- **Files:** `supabase/functions/aws-manager/index.ts`
- **Impact:** The function exposes `check-availability` and `register-domain` endpoints publicly without any authentication. An attacker can use the company's AWS credentials to check domains or register them (costing money) by simply sending a POST request.
- **Mitigation:** Enforce Supabase Auth validation using `getUser()` before processing requests.

### 3. IDOR in VeriFactu Dispatcher (HIGH)
- **Files:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Impact:** Debug endpoints (`test-cert`, `debug-test-update`, etc.) accept a `company_id` parameter and use the `service_role_key` to access data/certs without verifying if the caller belongs to that company.
- **Mitigation:** Verify `company_id` against the authenticated user's `company_members` record.

## Proposed Remediation
1.  **Immediate**: Apply migration `20280130000000_secure_child_tables.sql` to restore RLS.
2.  **Immediate**: Patch `aws-manager` to require valid User Session.
3.  **Immediate**: Patch `verifactu-dispatcher` to check company membership.

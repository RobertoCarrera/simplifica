# Security Audit Report - May 2028

## Executive Summary
This audit identified critical and high-severity vulnerabilities resulting from a regression to a previous codebase state (approx. Jan 2026). The primary risks are unauthenticated access to AWS resources and IDOR vulnerabilities in the VeriFactu dispatching system.

## Findings

### 1. Unauthenticated Domain Registration (CRITICAL)
- **Component**: Edge Function `aws-manager`
- **File**: `supabase/functions/aws-manager/index.ts`
- **Description**: The function processes `register-domain` actions without checking the `Authorization` header or validating the user's identity. Any user (or bot) can trigger this endpoint to purchase domains at the organization's expense.
- **Remediation**: Implement `supabase-js` client creation using `SUPABASE_ANON_KEY` and the user's `Authorization` header. Enforce `auth.getUser()` before processing actions.

### 2. IDOR in VeriFactu Dispatcher (HIGH)
- **Component**: Edge Function `verifactu-dispatcher`
- **File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: The function exposes debug endpoints (`debug-test-update`, `debug-env`, `debug-aeat-process`) that accept a `company_id` in the request body. These endpoints use the `service_role_key` to query/modify data for the specified company without checking if the caller belongs to that company.
- **Remediation**: Remove all debug endpoints. Ensure all operational endpoints utilize strict RLS-backed checks or explicit company membership validation.

### 3. Missing RLS on Child Tables (HIGH)
- **Component**: Database (PostgreSQL)
- **Files**: `invoice_items`, `quote_items`
- **Description**: While `invoices` and `quotes` have RLS policies, their child tables (`invoice_items`, `quote_items`) appear to lack specific RLS policies in the current migration history. This allows any authenticated user to potentially list all items across all companies.
- **Remediation**: Enable RLS on these tables and add policies that verify access via the parent table (e.g., `EXISTS (SELECT 1 FROM invoices WHERE id = invoice_items.invoice_id ...)`).

## Action Plan
1. Apply database migration to secure child tables.
2. Patch `aws-manager` to enforce authentication.
3. Patch `verifactu-dispatcher` to remove debug backdoors.

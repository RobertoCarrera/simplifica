# Security Audit Report - March 2028

## Overview
This audit was conducted on the "Simplifica" repository to detect security regressions and vulnerabilities. The system appears to have reverted to a January 2026 state, re-exposing previously patched vulnerabilities.

## Findings

### 1. AWS Manager - Unauthenticated RCE & Cost Injection (CRITICAL)
- **File**: `supabase/functions/aws-manager/index.ts`
- **Description**: The function processes actions (`register-domain`, `check-availability`) without any authentication check. Any user (or bot) can call this endpoint to register domains or check availability, incurring costs on the company's AWS account.
- **Impact**: Financial loss, Denial of Wallet, Potential RCE if payload injection is possible (though input seems structured).
- **Remediation**: Implement `supabase.auth.getUser()` validation using the Authorization header.

### 2. Child Tables RLS - Data Leak (CRITICAL)
- **Files**: Database Schema (`invoice_items`, `quote_items`)
- **Description**: The migration `20280130000000_secure_child_tables.sql` is missing. These tables likely lack RLS policies or have permissive ones, allowing any authenticated user to view invoice lines of other companies if they guess the IDs.
- **Impact**: Data Breach (Confidential financial data).
- **Remediation**: Create a migration to enable RLS on these tables and enforce checks via parent tables (`invoices`, `quotes`) and `company_members`.

### 3. VeriFactu Dispatcher - IDOR (HIGH)
- **File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: Several debug and maintenance endpoints (`debug-test-update`, `retry`, `test-cert`) accept `company_id` or `invoice_id` as input but do not verify that the authenticated user belongs to that company.
- **Impact**: Unprivileged users can reset VeriFactu events, view debug info, or trigger retries for other companies.
- **Remediation**: Implement `requireCompanyAccess` to validate membership in `company_members` before processing these actions.

### 4. Frontend Build Stability (LOW)
- **File**: `package.json`
- **Description**: Missing `@types/node-forge` dependency causes build failures.
- **Impact**: Development friction.
- **Remediation**: Add `@types/node-forge` to `devDependencies`.

## Proposed Actions
1. Patch `aws-manager` immediately.
2. Patch `verifactu-dispatcher` to prevent IDOR.
3. Apply RLS migration for child tables.

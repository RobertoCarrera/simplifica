# Security Audit Report - February 2026

## Executive Summary
A comprehensive security audit of the Simplifica codebase has identified critical vulnerabilities in Edge Functions and functional regressions caused by schema changes. The most severe issues allow unauthorized domain management and potential access to sensitive tax data (VeriFactu) via IDOR.

## Findings

### 1. `aws-manager` - Authentication Bypass (CRITICAL)
- **Affected File**: `supabase/functions/aws-manager/index.ts`
- **Issue**: The function executes AWS commands (Domain Registration, Availability Check) without verifying the caller's identity or permissions. Any user (or bot) with the function URL can execute these actions.
- **Impact**: Unauthorized domain registration (financial loss), information disclosure.
- **Remediation**: Implement mandatory JWT verification and Role-Based Access Control (RBAC) checking for `owner` or `super_admin` roles.

### 2. `verifactu-dispatcher` - IDOR in Debug Endpoints (HIGH)
- **Affected File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Issue**: Debug actions such as `debug-aeat-process`, `debug-test-update`, and `test-cert` accept a `company_id` in the request body but do not verify if the authenticated user belongs to that company.
- **Impact**: A malicious user could trigger AEAT submissions or inspect certificate validity for other companies.
- **Remediation**: Enforce `requireCompanyAccess(company_id)` on all debug endpoints to validate membership via `company_members`.

### 3. `create-payment-link` - Functional Denial of Service (HIGH)
- **Affected File**: `supabase/functions/create-payment-link/index.ts`
- **Issue**: The function queries the `role` column from the `users` table. This column was removed in migration `20260111130000`, causing the function to crash.
- **Impact**: Inability to generate payment links, blocking revenue collection.
- **Remediation**: Remove the `role` field from the select query.

### 4. Inconsistent RLS Policies (MEDIUM)
- **Affected File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (and others)
- **Issue**: Policies for tables like `verifactu_settings` and `payment_integrations` rely on `users.company_id` (Single-Tenant model). Newer logic (e.g., `invoices`) uses `company_members` (Multi-Tenant model).
- **Impact**: Users who belong to multiple companies (or are not in their "primary" company context) cannot access settings they should have access to.
- **Remediation**: Refactor all RLS policies to check `company_members` instead of `users.company_id`.

## Action Plan
1. Fix `aws-manager` immediately (Critical).
2. Fix `verifactu-dispatcher` (High).
3. Fix `create-payment-link` (High - Functional).

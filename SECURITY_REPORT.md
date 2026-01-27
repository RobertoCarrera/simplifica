# Security Audit Report - August 2027

## Summary
A security audit performed on the `Simplifica` repository identified a regression to a prior state (likely Jan 2026), re-exposing previously patched vulnerabilities. The critical findings involve Insecure Direct Object References (IDOR) in Edge Functions and missing or incorrect Row Level Security (RLS) policies.

## Findings

### 1. [CRITICAL] IDOR in `verifactu-dispatcher` Edge Function
- **File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: The function exposes several debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) that accept a `company_id` in the request body. These endpoints use the `SUPABASE_SERVICE_ROLE_KEY` to perform administrative actions but fail to verify if the authenticated user belongs to the specified `company_id`.
- **Impact**: Any authenticated user (or attacker with knowledge of the endpoint) can modify VeriFactu events, view sensitive AEAT process details, or test certificates for *any* company by simply changing the `company_id`.
- **Remediation**: Implement a `requireCompanyAccess` helper that verifies the user's membership in the target company before processing the request.

### 2. [CRITICAL] RLS Policy Logic Error in `company_members`
- **File**: Database Schema (Migration `20260107022000...`)
- **Description**: The RLS policies for `company_members` use `auth.uid()` directly against `user_id`. However, the system architecture distinguishes between `auth.users.id` (Auth Service) and `public.users.id` (Public Schema).
- **Impact**: Legitimate users may be denied access to their company data, or worse, if IDs accidentally collide, unauthorized access could occur. The policy effectively breaks the multi-tenancy model for membership checks.
- **Remediation**: Update RLS policies to bridge `auth.uid()` to `public.users.id` via `auth_user_id`.

### 3. [HIGH] Missing RLS on Child Tables (`invoice_items`, `quote_items`)
- **File**: Database Schema
- **Description**: While `invoices` and `quotes` have updated RLS policies, their child tables (`invoice_items`, `quote_items`) appear to lack explicit RLS policies in the active migrations.
- **Impact**: If RLS is not enabled or no policies exist, these tables might be publicly accessible or (if RLS is enabled but empty) inaccessible to legitimate users. Given the regression, they are likely unprotected.
- **Remediation**: Enable RLS on these tables and add policies that join with their parent tables (`invoices`, `quotes`) to inherit company access checks.

## Proposed Actions
1.  **Immediate**: Apply a new migration (`20270801000000_fix_security_critical.sql`) to fix RLS on `company_members` and secure child tables.
2.  **Immediate**: Patch `verifactu-dispatcher` to enforce `requireCompanyAccess`.

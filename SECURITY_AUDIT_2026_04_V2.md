# Security Audit Report - Simplifica CRM (April 2026) - Iteration 2

**Date:** 2026-04-13
**Auditor:** Jules (Security Engineer)

## Summary
This audit focused on RLS policies and multi-tenancy enforcement. Critical vulnerabilities were found in `domains` and `scheduled_jobs` tables where RLS policies allow cross-tenant access for admins. Additionally, several policies use `TO public` which is against best practices.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `domains` Table
- **File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (and previous)
- **Issue**: The policy `Admins can manage all domains` checks if the current user is an admin but does not verify that the domain belongs to the same company as the admin.
- **Impact**: An admin from Company A can view, edit, or delete domains belonging to Company B.
- **Remediation**: Update RLS to join `public.users` and enforce `company_id` match between the admin and the domain owner.

### 2. [CRITICAL] Cross-Tenant Data Leak in `scheduled_jobs` Table
- **File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Issue**: The `scheduled_jobs` table lacks a `company_id` column (inferred) and the RLS policy `scheduled_jobs_read` grants global read access to any user with an admin role.
- **Impact**: Admins can view scheduled jobs (e.g., invoice conversions) of other companies, potentially leaking business intelligence or PII in payloads.
- **Remediation**: Add `company_id` column to `scheduled_jobs`, populate it, and filter RLS by `company_id`.

### 3. [HIGH] Insecure `TO public` Policies
- **File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Issue**: `verifactu_settings` and `verifactu_cert_history` tables have RLS policies applied `TO public`. While they contain checks for `auth.uid()`, using `TO public` is risky and allows unauthenticated evaluation (though typically fails due to null `auth.uid()`).
- **Impact**: Potential exposure if `auth.uid()` behavior changes or checks are flawed.
- **Remediation**: Change policies to `TO authenticated`.

### 4. [MEDIUM] `scheduled_jobs` Insert Missing Context
- **File**: `supabase/functions/client-quote-respond/index.ts`
- **Issue**: Edge function inserts into `scheduled_jobs` without providing `company_id`.
- **Impact**: Jobs created are orphaned or global, contributing to the cross-tenant leak.
- **Remediation**: Update function to insert `company_id`.

## Planned Actions
- Create migration `20260413000000_fix_rls_leaks.sql` to patch RLS for `domains`, `scheduled_jobs`, and `verifactu_settings`.
- Update `client-quote-respond` edge function to properly attribute jobs to companies.

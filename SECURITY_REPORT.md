# Security Audit Report - Simplifica CRM

**Date**: April 21, 2026
**Auditor**: Security Engineer (AI)

## Summary
This audit focused on RLS policies, Multi-tenancy isolation, and Edge Function security. Critical vulnerabilities were found in cross-tenant data access (RLS) and insecure debug endpoints in Edge Functions (IDOR).

## Findings

### 1. [CRITICAL] Cross-Tenant Access in `payment_integrations` RLS
- **Severity**: Critical
- **Affected File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Existing state)
- **Description**: The RLS policies for `payment_integrations` check if a user has an 'admin' or 'owner' role but fail to verify if the user belongs to the `company_id` of the record.
- **Impact**: Any user with an 'admin' role in *any* company can view, modify, or delete payment integration credentials (Encrypted keys, API secrets) of *all other companies* on the platform.
- **Remediation**: Update RLS policies to explicitly join against `public.company_members` to verify the user's membership in the target company.

### 2. [CRITICAL] IDOR & Insecure Debug Endpoints in `verifactu-dispatcher`
- **Severity**: Critical
- **Affected File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: The function exposes several debug actions (`debug-test-update`, `debug-aeat-process`, `debug-last-event`, `diag`) that accept a `company_id` in the payload. These endpoints use the Service Role (admin) client to fetch or modify data but do **not** perform any authorization check to see if the caller belongs to that company.
- **Impact**: An attacker (even an authenticated low-privileged user) could trigger these endpoints to:
    - View sensitive invoice metadata and AEAT responses for any company.
    - Trigger arbitrary updates to VeriFactu event states.
    - Leak environment variables or configuration.
- **Remediation**: Remove these debug endpoints entirely in production code.

### 3. [HIGH] Deprecated User-Company Mapping in Financial Logic
- **Severity**: High
- **Affected File**: `supabase/migrations/20260129160000_finance_security_logic.sql` (`convert_quote_to_invoice`)
- **Description**: The function `convert_quote_to_invoice` uses `public.users.company_id` to determine the user's company. This column is deprecated in favor of `public.company_members`.
- **Impact**: Potential access control bypass or denial of service if the legacy column is out of sync with the actual `company_members` table, especially for users with multiple company associations.
- **Remediation**: Refactor the function to validate against `public.company_members`.

### 4. [HIGH] Missing RLS on Sensitive Tables
- **Severity**: High
- **Affected Tables**: `verifactu_settings` (Policies exist but rely on legacy `users.company_id` and might share similar flaws to `payment_integrations` if not carefully checked), `products` (Needs verification).
- **Description**: `verifactu_settings` policies rely on `u.company_id = verifactu_settings.company_id`. While safer than `payment_integrations` (which had no check), it relies on the deprecated column.
- **Remediation**: Update policies to use `company_members`.

## Action Plan
1. Fix `payment_integrations` RLS policies immediately.
2. Remove insecure debug endpoints from `verifactu-dispatcher`.

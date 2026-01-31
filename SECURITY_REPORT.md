# Security Audit Report - February 2026

## Executive Summary
This report summarizes critical security vulnerabilities identified during the routine audit of the Simplifica CRM codebase. The focus was on RLS policies, Edge Functions security, and multi-tenancy isolation.

**Total Findings:** 4
- **Critical:** 2
- **High:** 1
- **Medium/Bug:** 1

## Findings Detail

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Description:** The RLS policies for `payment_integrations` (Select/Insert/Update/Delete) currently allow any user with an 'admin' or 'owner' role to access *all* records in the table, regardless of the `company_id`.
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Risk:** An attacker with a valid account in one company could retrieve payment credentials (Stripe/PayPal API keys) of other companies.
- **Remediation:** Update policies to strictly enforce `company_id` matching against `public.company_members`.

### 2. [CRITICAL] Unauthenticated Access in `aws-manager` Edge Function
- **Description:** The `aws-manager` function does not validate the `Authorization` header or check user permissions. It accepts any JSON payload to register domains via AWS Route53.
- **Location:** `supabase/functions/aws-manager/index.ts`
- **Risk:** Unauthenticated attackers can register domains using the platform's AWS credentials, incurring financial costs and potentially hijacking domains.
- **Remediation:** Implement `createClient` with Auth header validation and restrict access to 'super_admin' or 'owner' roles.

### 3. [HIGH] IDOR in `verifactu-dispatcher` Debug Endpoints
- **Description:** Several debug actions (`debug-aeat-process`, `debug-test-update`, `test-cert`) rely on a `company_id` provided in the request body without verifying if the authenticated user belongs to that company.
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Risk:** An attacker could trigger AEAT submissions, modify event states, or inspect certificate validity for other companies.
- **Remediation:** Implement a `requireCompanyAccess` helper to validate membership before processing these actions.

### 4. [MEDIUM/BUG] Broken Logic in `create-payment-link`
- **Description:** The function queries the `role` column from `public.users`, but this column was removed in migration `20260111130000`.
- **Location:** `supabase/functions/create-payment-link/index.ts`
- **Risk:** The function likely fails (500 Internal Server Error) for all requests, causing denial of service for payment link generation. While primarily a bug, it affects availability.
- **Remediation:** Update the query to fetch roles from `public.company_members` or `public.app_roles`.

## Next Steps
Immediate remediation actions are planned for the CRITICAL and HIGH findings via two separate Pull Requests.

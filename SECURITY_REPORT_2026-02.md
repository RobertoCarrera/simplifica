# Security Audit Report - Feb 2026

**Auditor**: Jules (Senior Security Engineer)
**Date**: Feb 2026
**Target**: Simplifica CRM (Supabase + Angular)

## Summary
This audit focused on Data Layer (RLS), Edge Functions, and Financial Logic. Two **CRITICAL** vulnerabilities were identified that require immediate remediation.

## Findings

### 1. [CRITICAL] Cross-Tenant Access in `payment_integrations` (RLS)
- **Component**: Database / RLS Policies
- **File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (defines current policies)
- **Description**: The current `SELECT`, `INSERT`, `UPDATE`, `DELETE` policies for `public.payment_integrations` are set `TO public` and use a `USING` clause that only checks if the user has an admin role:
  ```sql
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
      WHERE u.auth_user_id = auth.uid() AND ar.name IN ('owner', 'admin', 'super_admin')
    )
  )
  ```
  **It does not filter by `company_id`.**
- **Impact**: Any user with an 'admin' role in *any* company can view and modify payment integrations (Stripe/PayPal credentials) of **ALL** other companies on the platform. This is a complete breakdown of multi-tenancy for sensitive credentials.
- **Remediation**: Update RLS to join with `company_members` (or check `company_id`) to ensure the user belongs to the same company as the integration record.

### 2. [CRITICAL] Unauthenticated Access to `aws-manager` (Edge Function)
- **Component**: Edge Functions
- **File**: `supabase/functions/aws-manager/index.ts`
- **Description**: The function handles `check-availability` and `register-domain` actions but performs **no authentication checks**. It blindly trusts any request.
- **Impact**:
  - **Financial**: An attacker can register domains at the company's expense (`register-domain`).
  - **DoS**: An attacker can spam availability checks.
- **Remediation**: Implement `supabase.auth.getUser()` verification using the `Authorization` header.

### 3. [HIGH] Insecure Debug Endpoints in `verifactu-dispatcher`
- **Component**: Edge Functions
- **File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: The function exposes actions like `debug-test-update`, `debug-last-event`, `debug-aeat-process` which accept `company_id` in the body. While `requireInvoiceAccess` exists, these debug actions do not seem to use it or enforce company membership.
- **Impact**: Potential IDOR allowing modification of VeriFactu event states or resetting events for any company.
- **Remediation**: Remove debug endpoints in production or enforce strict `requireCompanyAccess`.

### 4. [HIGH] Ambiguous Scope of `integrations` Table
- **Component**: Database
- **File**: `supabase/migrations/20260110210000_create_booking_system.sql`
- **Description**: The `integrations` table (Google Calendar) is linked to `user_id` only. If it is intended for company-wide scheduling, this design prevents centralized management. If an employee leaves, the integration might break or persist inappropriately.
- **Remediation**: Review if `integrations` should be owned by `companies`.

## Action Plan
1. Fix `payment_integrations` RLS immediately.
2. Secure `aws-manager` immediately.
3. Schedule cleanup of `verifactu-dispatcher` for next sprint.

# Security Audit Report - Simplifica CRM
**Date:** May 27, 2026
**Auditor:** Jules (Senior Security Engineer)

## Summary
This audit focused on the Data Layer (RLS) and critical Edge Functions. Two Critical vulnerabilities and two High-Risk vulnerabilities were identified.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations` (RLS)
- **Severity:** CRITICAL
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Policy: `payment_integrations_select`, etc.)
- **Description:** The RLS policies for `payment_integrations` check if the user is an admin but **do not check if the integration belongs to the user's company**.
- **Impact:** Any admin from Company A can view, edit, or delete payment integrations (Stripe/PayPal keys) of Company B, Company C, etc.
- **Remediation:** Update policies to enforce `u.company_id = payment_integrations.company_id`.

### 2. [CRITICAL] Cross-Tenant Management of Domains (RLS)
- **Severity:** CRITICAL
- **Location:** `supabase/migrations/20260110200000_rename_mail_domains.sql` (Policy: `Admins can manage all domains`)
- **Description:** The policy allows any user with an 'admin' role to manage *all* rows in the `domains` table, regardless of who owns them.
- **Impact:** An admin from Company A can verify, delete, or modify domains owned by users in Company B.
- **Remediation:** Update policies to ensure the admin shares the same `company_id` as the domain's owner (`assigned_to_user`).

### 3. [HIGH] Insecure Debug Backdoors in `verifactu-dispatcher`
- **Severity:** HIGH
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function contains hardcoded debug actions (`debug-env`, `debug-aeat-process`, `debug-test-update`, `debug-last-event`) that expose internal environment variables, configuration, and allow manipulation of event states.
- **Impact:** Information disclosure (environment variables, keys) and potential data integrity violation (resetting event attempts).
- **Remediation:** Remove all debug actions from the production code.

### 4. [HIGH] IDOR in `verifactu-dispatcher` (Cert Testing)
- **Severity:** HIGH
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts` (Action: `test-cert`)
- **Description:** The `test-cert` action accepts a `company_id` and performs sensitive operations (decrypting certs, signing test XML) without verifying if the authenticated user belongs to that company.
- **Impact:** Any authenticated user can test (and potentially infer validity/existence of) certificates for any other company.
- **Remediation:** Implement strict ownership checks verifying the caller's `company_id` matches the target `company_id`.

## Planned Actions
1. Apply migration `20260527000000_fix_critical_rls_leaks.sql` to fix RLS policies.
2. Patch `verifactu-dispatcher` to remove backdoors and fix IDOR.

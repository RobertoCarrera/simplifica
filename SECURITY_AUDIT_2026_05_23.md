# Security Audit Report - 2026-05-23

## Executive Summary
This audit focused on RLS policies for multi-tenant tables and Edge Function security. Critical vulnerabilities were found in `payment_integrations` and `domains` tables where RLS policies were overly permissive, allowing cross-tenant data access. High-severity issues were also found in `verifactu-dispatcher` exposing debug environment variables.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Severity:** CRITICAL
- **Location:** Database RLS Policies (Migration `20260111130000_remove_legacy_role_column.sql`)
- **Description:** The RLS policy `payment_integrations_select` (and others) grants access to any user with an 'admin' role regardless of which company they belong to. It checks `ar.name IN ('owner', 'admin')` for the *current user* but fails to check if the `payment_integrations` record belongs to the user's company.
- **Impact:** An admin of Company A can view and modify payment keys (Stripe/PayPal) of Company B.
- **Remediation:** Update policies to enforce `company_id` match.

### 2. [CRITICAL] Cross-Tenant Data Leak in `domains`
- **Severity:** CRITICAL
- **Location:** Database RLS Policies
- **Description:** Similar to `payment_integrations`, the `domains` table allows any admin to manage all domains. The table lacks a direct `company_id` but links to `assigned_to_user`.
- **Impact:** An admin can view or delete verification tokens of domains belonging to other users/companies.
- **Remediation:** Restrict access to the assigned user and admins of the *same* company (via join on `users`).

### 3. [HIGH] Information Disclosure in `verifactu-dispatcher`
- **Severity:** HIGH
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function includes debug actions `debug-env` and `debug-test-update` which are accessible to any authenticated user (or anyone if the function is public). `debug-env` returns all environment variables, potentially leaking secrets if not carefully managed. `debug-test-update` allows arbitrary modification of event attempts.
- **Impact:** Leakage of configuration/secrets; Integrity violation of VeriFactu event logs.
- **Remediation:** Remove these debug actions in production code.

### 4. [MEDIUM] Unrestricted Access to `scheduled_jobs`
- **Severity:** MEDIUM
- **Location:** Database RLS Policies
- **Description:** The `scheduled_jobs` table is readable by any admin. It appears to be an internal backend table not used by the frontend.
- **Impact:** Unnecessary exposure of system internal state.
- **Remediation:** Revoke public/authenticated access; restrict to `service_role`.

## Plan of Action
1. Apply migration `20260523000000_fix_critical_rls_leaks.sql` to fix RLS policies.
2. Patch `verifactu-dispatcher` to remove debug backdoors.

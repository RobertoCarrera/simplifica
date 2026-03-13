# Security Audit Report - 2026-02-26

## Executive Summary
This audit focused on RLS policies and Edge Functions. Three critical/high severity issues were identified, primarily revolving around cross-tenant data leaks introduced in a recent refactoring of roles (`20260111130000`) and insecure debug endpoints in the VeriFactu dispatcher.

## Findings

### 1. CRITICAL: Cross-Tenant Data Leak in Payment Integrations & Domains
**Severity:** Critical
**Affected Components:** Database RLS (`payment_integrations`, `domains`, `scheduled_jobs`)
**Description:**
The migration `20260111130000_remove_legacy_role_column.sql` introduced RLS policies that grant access to `payment_integrations` and `domains` based solely on the user having an 'admin' or 'owner' role, *without* checking if the user belongs to the company owning the resource.
**Impact:**
Any admin from Company A can view and modify payment integrations (Stripe/PayPal keys) and verified domains of Company B. This is a complete breach of multi-tenancy isolation for these resources.
**remediation:**
Update RLS policies to strictly enforce `company_id` matching between the authenticated user and the target resource.

### 2. HIGH: Insecure Debug Actions in VeriFactu Dispatcher
**Severity:** High
**Affected Components:** Edge Function (`verifactu-dispatcher`)
**Description:**
The `verifactu-dispatcher` function contains hardcoded debug actions (`debug-env`, `debug-test-update`, `debug-last-event`) that are accessible via HTTP POST. These actions expose environment variables (including secrets) and allow arbitrary modification of event states. While the function requires `SUPABASE_SERVICE_ROLE_KEY` to *run* its internal logic, the entry point might be accessible to `anon` users depending on function configuration, or simply insecure if the URL is known.
**Impact:**
Information disclosure (environment variables, secrets) and potential integrity violation (modifying event states).
**Remediation:**
Remove the debug actions entirely from the production code.

### 3. MEDIUM: Potential Leak in Scheduled Jobs
**Severity:** Medium/High
**Affected Components:** Database RLS (`scheduled_jobs`)
**Description:**
Similar to `payment_integrations`, the `scheduled_jobs` table allows access to any admin. If this table contains sensitive company data, it is leaked.
**Remediation:**
Restrict access to `service_role` only, or enforce `company_id` checks if it's a multi-tenant table.

## Action Plan
1.  **Immediate Fix**: Apply migration `20260226000000_fix_critical_rls_leaks.sql` to patch RLS policies.
2.  **Code Remediation**: Remove debug code from `verifactu-dispatcher`.

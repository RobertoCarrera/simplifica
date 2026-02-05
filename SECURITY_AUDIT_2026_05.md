# Security Audit Report - May 2026

**Date:** 2026-05-02
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
This audit focused on RLS multi-tenancy enforcement and Edge Function security. Critical vulnerabilities were identified in the data layer where cross-tenant access was possible for admins. High-risk debug backdoors and insecure default configurations were found in Edge Functions.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in RLS Policies
**Affected Tables:** `payment_integrations`, `domains`, `scheduled_jobs`
**Risk:**
Admins of any company can view, modify, or delete sensitive data (payment keys, domains, job schedules) belonging to *other* companies.
**Root Cause:**
Migration `20260111130000_remove_legacy_role_column.sql` introduced policies that check if the user is *an admin*, but fail to check if the target resource belongs to the *same company* as the user.
**Remediation:**
Update RLS policies to strictly enforce `company_id` matching between the requesting user and the resource.

### 2. [HIGH] Debug Backdoors in `verifactu-dispatcher`
**Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
**Risk:**
Unauthenticated or low-privilege users can trigger arbitrary database updates (`debug-test-update`), view environment variables (`debug-env`), and dump database records (`debug-last-event`, `diag`). This leads to IDOR, Information Disclosure, and potential Integrity violations.
**Remediation:**
Remove all `debug-*` actions and the `diag` endpoint.

### 3. [HIGH] Insecure Default Encryption Keys
**Affected File:** `supabase/functions/payment-webhook-stripe/index.ts`
**Risk:**
The function defaults to `"default-dev-key-change-in-prod"` if `ENCRYPTION_KEY` is missing. If the environment variable is accidentally unset in production, the system "fails open" using a known weak key, compromising webhook signature verification and payload decryption.
**Remediation:**
Implement "Fail Closed" logic. Explicitly throw an error if the key is missing.

### 4. [MEDIUM] `scheduled_jobs` Exposed to Public
**Affected Table:** `scheduled_jobs`
**Risk:**
Internal background job definitions are readable by any authenticated admin via the public API.
**Remediation:**
Restrict access to `service_role` only, as the frontend does not require access to this table.

## Action Plan
1.  **Immediate Fix:** Apply migration `20260502000000_fix_critical_rls.sql` to lock down RLS.
2.  **Hardening:** Patch Edge Functions to remove backdoors and enforce secure configuration.

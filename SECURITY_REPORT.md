# Security Audit Report

## Executive Summary
This report details the findings of a security audit performed on the "Simplifica" CRM. The audit focused on Edge Functions, RLS policies, and general configuration. Critical vulnerabilities were identified in the `aws-manager` function (unauthenticated access) and `verifactu-dispatcher` (debug endpoints exposing IDOR).

## Findings

### 1. `aws-manager` Unauthenticated Access (CRITICAL)
- **File:** `supabase/functions/aws-manager/index.ts`
- **Description:** The function initializes AWS clients and executes actions (`check-availability`, `register-domain`) based on the request body without any authentication. It does not use the Supabase client to verify the caller's identity.
- **Impact:** An attacker could invoke this function to perform AWS operations (e.g., registering domains, checking availability) at the company's expense or potentially disrupting services.
- **Mitigation:** Implement Supabase Auth validation. Ensure `supabase.auth.getUser()` is called and verified before processing any action.

### 2. `verifactu-dispatcher` Debug Endpoints & IDOR (HIGH)
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function contains several debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`) that were likely intended for development.
    - `debug-env` exposes environment variables.
    - `debug-test-update` allows modifying event states.
    - `debug-last-event` and `debug-aeat-process` accept a `company_id` in the body and return data for that company without verifying if the caller belongs to it (IDOR).
- **Impact:** Information disclosure (env vars), data tampering (modifying event attempts), and unauthorized access to company data (IDOR).
- **Mitigation:** Remove all debug endpoints immediately.

### 3. RLS Policies (Medium/Info)
- **File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (and others)
- **Description:** `verifactu_settings` RLS policies correctly use `auth.uid()` and join against `company_members` (via the logic in the migration) to ensure multi-tenancy isolation.
- **Impact:** No immediate vulnerability detected, but the complexity of migrations warrants continuous monitoring.
- **Mitigation:** Maintain current policies. Ensure future migrations do not accidentally revert these checks.

## Recommendations
1. **Immediate:** Apply patches to `aws-manager` and `verifactu-dispatcher`.
2. **Short-term:** Establish a process to strip debug code from production builds.
3. **Long-term:** Implement automated security scanning for Edge Functions to detect missing auth checks.

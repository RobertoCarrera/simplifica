# Security Report - Simplifica

**Date:** Feb 01, 2026
**Auditor:** Jules (Senior Security Engineer)

## Summary
This audit focused on RLS policies and Edge Functions. Two critical/high findings were identified requiring immediate attention.

## Findings

### 1. [CRITICAL] Cross-Tenant Access in `payment_integrations` Table
**Affected Files:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (and current schema)
**Impact:**
RLS policies for `payment_integrations` verify that the user is an 'admin' or 'owner' but fail to verify that the user belongs to the same `company_id` as the integration record.
**Risk:**
Any admin of *any* company can view, create, update, or delete payment integration credentials (API keys, secrets) of *all other companies*.
**Mitigation:**
Update RLS policies to enforce `u.company_id = payment_integrations.company_id`.

### 2. [HIGH] IDOR & Privilege Escalation in `verifactu-dispatcher`
**Affected Files:** `supabase/functions/verifactu-dispatcher/index.ts`
**Impact:**
The Edge Function exposes debug endpoints (`debug-aeat-process`, `debug-env`, etc.) and `test-cert` action that accept a `company_id` in the body but do not verify if the authenticated user belongs to that company.
**Risk:**
1. **IDOR:** An attacker can trigger VeriFactu processes or retrieve status/logs for any company by guessing `company_id`.
2. **Information Disclosure:** `debug-aeat-process` leaks certificate environment details and NIFs. `test-cert` confirms if a company has valid certs.
**Mitigation:**
1. Remove all debug endpoints.
2. Implement strict authorization checks (`requireCompanyAccess`) for `test-cert`.

### 3. [MEDIUM] Potential RLS Gaps in `app_settings` and `scheduled_jobs`
**Affected Files:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
**Impact:**
Similar to `payment_integrations`, these tables use loose checks. If they contain multi-tenant data, they are leaked. `app_settings` appears global, so it might be acceptable if it's system-wide config, but needs verification.
**Mitigation:**
Review table definitions. If multi-tenant, add `company_id` checks.

## Recommendations
- Immediate deployment of RLS fixes.
- Immediate redeployment of hardened `verifactu-dispatcher`.
- Review all other policies in `20260111130000...` for similar patterns.

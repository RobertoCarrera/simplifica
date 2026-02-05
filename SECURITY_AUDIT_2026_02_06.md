# Security Audit Report - 2026-02-06

## Executive Summary
This audit focused on Critical RLS vulnerabilities and High-risk Edge Function flaws.
**Status**: 2 Critical findings, 1 High finding.

## Findings

### 1. CRITICAL: Cross-Tenant Data Leak in RLS Policies
**Affected Resources**: `payment_integrations`, `domains`, `scheduled_jobs`.
**Description**:
Migration `20260111130000_remove_legacy_role_column.sql` introduced permissive policies that check for admin/owner roles but fail to verify `company_id` ownership of the resource.
- `payment_integrations`: Admins can view/edit integrations of ANY company.
- `domains`: Admins can manage domains of users in OTHER companies.
- `scheduled_jobs`: Publicly readable by any admin, should be internal/service_role only.

**Impact**:
- Massive data leak of credentials (payment keys) and domain configurations.
- Potential takeover of domains or payment flows.

**remediation**:
- Update RLS policies to enforce `company_id` equality check.
- Restrict `scheduled_jobs` to `service_role`.

### 2. HIGH: IDOR and Information Disclosure in `verifactu-dispatcher`
**Affected Resource**: `supabase/functions/verifactu-dispatcher/index.ts`
**Description**:
The function contains hardcoded debug actions (`debug-env`, `debug-test-update`, `debug-last-event`, `debug-aeat-process`) that bypass standard checks and allow:
- Viewing environment variable status.
- Modifying/Resetting events for arbitrary `company_id`.
- Viewing last event details for arbitrary `company_id`.

**Impact**:
- IDOR allowing manipulation of VeriFactu events for other companies.
- Leakage of system configuration.

**Remediation**:
- Remove all debug blocks.

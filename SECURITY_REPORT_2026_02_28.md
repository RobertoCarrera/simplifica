# Security Audit Report - Feb 28, 2026

## Executive Summary
A recurring reversion of the repository state has reintroduced critical security vulnerabilities previously identified and fixed. Immediate action is required to secure multi-tenant data isolation (RLS) and Edge Function endpoints.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Description:** The RLS policies for `payment_integrations` rely solely on the user having an 'admin' role, without checking if the user belongs to the company owning the integration.
- **Impact:** Any admin of any company can view, modify, or delete payment integrations (Stripe/PayPal keys) of *all* other companies.
- **Affected File:** Database Schema (reverted state from `20260111130000_remove_legacy_role_column.sql`).
- **Remediation:** Update RLS policies to enforce `company_id` matching between the user and the record.

### 2. [CRITICAL] Cross-Tenant Data Leak in `item_tags`
- **Description:** The `item_tags` table policies allow `SELECT` for all authenticated users (`USING (true)`).
- **Impact:** Business intelligence data (how companies tag clients, tickets, etc.) is visible to all authenticated users across tenants.
- **Affected File:** Database Schema (reverted state from `20260106110000_unified_tags_schema.sql`).
- **Remediation:** Denormalize `company_id` onto `item_tags` and enforce strict RLS.

### 3. [HIGH] IDOR in `verifactu-dispatcher` Debug Endpoints
- **Description:** Debug endpoints (`debug-test-update`, `test-cert`, `debug-aeat-process`) accept `company_id` in the request body but do not verify if the caller is authorized for that company.
- **Impact:** An attacker can trigger debug actions, modify event states, or retrieve certificate details of other companies.
- **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`.
- **Remediation:** Implement and apply a `requireCompanyAccess(company_id)` check for all sensitive endpoints.

## Action Plan
1. Apply migration `20260228100000_fix_critical_rls.sql` to fix RLS issues.
2. Patch `verifactu-dispatcher` to include authorization checks.

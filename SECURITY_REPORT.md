# Security Audit Report - Simplifica CRM

**Date:** March 3, 2026
**Auditor:** Jules (Security Engineer)

## Executive Summary
A security audit was performed on the `Simplifica` codebase, focusing on RLS (Row Level Security), Edge Functions, and Multi-tenancy isolation. Three critical/high severity vulnerabilities were identified that require immediate remediation.

## Findings

### 1. Critical: Cross-Tenant Data Leak in `payment_integrations` (RLS)
- **Severity:** CRITICAL
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Policies on `payment_integrations`)
- **Description:** The RLS policies for `payment_integrations` (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) allow access to *any* user with an `admin` or `owner` role, regardless of which company they belong to. The policy checks `auth.uid()` against `users` table to verify the role, but fails to check if the user belongs to the same `company_id` as the integration record.
- **Impact:** An admin of Company A can view, modify, or delete payment integrations (API keys, secrets) of Company B.
- **Remediation:** Update policies to join `users` and enforce `u.company_id = payment_integrations.company_id`.

### 2. Critical: Unrestricted Access to `item_tags` (RLS)
- **Severity:** CRITICAL
- **Location:** `supabase/migrations/20260106110000_unified_tags_schema.sql`
- **Description:** The `item_tags` table has RLS policies defined as `TO authenticated USING (true)` and `WITH CHECK (true)`.
- **Impact:** Any authenticated user can read, create, or delete tag assignments for any record (clients, tickets, services) across the entire platform. This is a complete bypass of multi-tenancy for this table.
- **Remediation:**
    1. Add `company_id` column to `item_tags`.
    2. Backfill `company_id` from parent records (`clients`, `tickets`, `services`).
    3. Enforce strict RLS based on `company_id`.

### 3. High: IDOR in `verifactu-dispatcher` Edge Function
- **Severity:** HIGH
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** Several debug and test endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) accept a `company_id` in the request body and use the `SUPABASE_SERVICE_ROLE_KEY` to access data for that company. There is no verification that the caller (authenticated via Bearer token) actually belongs to the requested `company_id`.
- **Impact:** A malicious user can perform administrative actions or view sensitive VeriFactu events/certificates of other companies by guessing their `company_id`.
- **Remediation:** Implement a `requireCompanyAccess` helper that verifies the user's affiliation with the target `company_id` using their own auth token before proceeding.

## Next Steps
- Immediate application of RLS fixes (PR #1).
- Patching of Edge Functions (PR #2).

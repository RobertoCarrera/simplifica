# Security Audit Report - February 2026

**Auditor:** Jules (Senior Security Engineer)
**Date:** 2026-02-10
**Target:** Simplifica CRM (Supabase + Angular)

## Executive Summary
This audit focused on RLS multi-tenancy, Edge Functions integrity, and financial logic. Critical vulnerabilities were found in the RLS layer where `payment_integrations` exposed data cross-tenant. High-impact availability issues were found in Edge Functions due to missing schema elements and reliance on deleted columns.

## Findings

### 1. Data Layer (RLS)

#### [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Impact:** Any admin of ANY company can view and edit payment integrations (Stripe/PayPal credentials) of ALL other companies.
- **Root Cause:** Policies check for `admin` role but fail to filter by `company_id`.
- **Mitigation:** Update policies to enforce `company_members.company_id` matches the record's `company_id`.

#### [CRITICAL] Authentication Bypass / Denial of Service in RLS
- **Location:** `company_members`, `app_settings`, `client_variant_assignments` policies.
- **Impact:** Legitimate users/admins are denied access (DoS) or potential for bypass if ID collision occurs.
- **Root Cause:** Policies compare `users.id` (Internal UUID) directly with `auth.uid()` (Supabase Auth UUID). These are distinct values.
- **Mitigation:** Policies must lookup `users.id` via `auth_user_id` or join tables.

#### [MEDIUM] Legacy Dependency on `users.company_id`
- **Location:** `verifactu_settings` policies, `convert_quote_to_invoice`.
- **Impact:** Prevents proper multi-tenancy (users belonging to multiple companies).
- **Mitigation:** Refactor to use `company_members` table.

### 2. Edge Functions

#### [HIGH] Function Crash due to Missing RPC
- **Location:** `supabase/functions/issue-invoice/index.ts`
- **Impact:** Invoicing system is down. The function calls `verifactu_preflight_issue` which does not exist in the database.
- **Root Cause:** Migration gap.
- **Mitigation:** Create a stub/placeholder RPC to restore availability and error handling.

#### [HIGH] Function Crash due to Schema Drift
- **Location:** `supabase/functions/payment-integrations-test/index.ts`
- **Impact:** Payment testing fails.
- **Root Cause:** Function queries `users.role` which was deleted in migration `20260111130000`.
- **Mitigation:** Refactor to query `company_members` for role and company association.

### 3. Financial Logic

#### [HIGH] Integrity of Invoices
- **Location:** `invoices` table.
- **Observation:** Recent migration `20260129160000` improved RLS, but `convert_quote_to_invoice` still relies on legacy single-tenant logic.
- **Mitigation:** Include in the refactoring of RLS.

## Action Plan
1.  **Immediate Fix:** Apply migration `20260210100000_fix_security_critical.sql` to fix RLS leaks and mismatches.
2.  **Immediate Fix:** Patch `payment-integrations-test` Edge Function.
3.  **Follow-up:** Full refactor of `convert_quote_to_invoice` (lower priority than RLS/Crash fixes).

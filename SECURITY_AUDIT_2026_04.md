# Security Audit Report - April 2026

## Executive Summary
This audit focused on Critical and High priority risks in the Data Layer (RLS) and Edge Functions. Three major vulnerabilities were identified, including a critical cross-tenant data leak in payment integrations and a public write access vulnerability in the tagging system.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **File**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Description**: The RLS policies for `payment_integrations` (SELECT, INSERT, UPDATE, DELETE) are set `TO public` and check only if the user is an admin (`owner`, `admin`, `super_admin`) via `auth.uid()`. **They do not verify that the user belongs to the company owning the integration.**
- **Impact**: Any admin of *any* company can view, modify, or delete Stripe/PayPal integration settings (including encrypted secrets) of *all* other companies.
- **Remediation**: Update RLS policies to enforce `u.company_id = payment_integrations.company_id`.

### 2. [CRITICAL] Public Access to `item_tags`
- **File**: `supabase/migrations/20260106110000_unified_tags_schema.sql`
- **Description**: The `item_tags` table lacks a `company_id` column. Its RLS policies allow `INSERT` and `SELECT` to `authenticated` users with `WITH CHECK (true)` / `USING (true)`.
- **Impact**: Any authenticated user can create tags for any record (client, ticket, etc.) regardless of company ownership. This allows data pollution and potential information disclosure (if tags reveal sensitive categories).
- **Remediation**: Add `company_id` to `item_tags`, backfill data, and restrict access to company members.

### 3. [HIGH] IDOR and Information Disclosure in `verifactu-dispatcher`
- **File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**:
  - Several debug endpoints (`debug-test-update`, `debug-env`, etc.) are exposed. `debug-env` dumps environment configuration. `debug-test-update` allows modifying event attempts via `body.company_id` without auth checks.
  - The `test-cert` action relies on `body.company_id` without verifying the caller's affiliation, allowing an attacker to test/validate certificates of other companies (IDOR).
- **Impact**: Potential manipulation of VeriFactu event states, leakage of environment config, and unauthorized usage of company certificates for testing.
- **Remediation**: Remove debug endpoints. Harden `test-cert` to derive `company_id` from the authenticated user's profile.

### 4. [MEDIUM] `company_members` Policies `TO public`
- **File**: `supabase/migrations/20260111070000_fix_company_members_recursion.sql`
- **Description**: Policies use `TO public` relying on a security definer function. While likely safe if the function is robust, it is a non-standard practice that increases the attack surface.
- **Remediation**: Review and switch to `TO authenticated` where possible. (Not addressed in this PR cycle to prioritize Criticals).

## Planned Fixes
1.  **Fix `payment_integrations` RLS**: Apply strict company-level filtering.
2.  **Fix `item_tags` RLS**: Add `company_id` and enforce ownership checks.
3.  **Harden `verifactu-dispatcher`**: Remove debug code and secure certificate testing.

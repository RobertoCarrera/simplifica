# Security Audit Report - February 2026

## Executive Summary
This audit identified **3 Critical** and **1 High** priority security vulnerabilities in the "Simplifica" CRM. The most critical issues involve Cross-Tenant Data Leaks (RLS) where users from one company could potentially access or modify data belonging to other companies.

## Findings

### 1. [CRITICAL] Payment Integrations Cross-Tenant Leak
- **Risk:** The RLS policy for `payment_integrations` allows any user with 'owner' or 'admin' role to view ALL payment integrations, regardless of company.
- **Impact:** An admin of Company A can view Stripe/PayPal credentials of Company B.
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Mitigation:** Enforce `company_id` check against `public.company_members`.

### 2. [CRITICAL] Item Tags Unrestricted Access
- **Risk:** The `item_tags` table allows `INSERT` with `WITH CHECK (true)` for any authenticated user.
- **Impact:** Any user can tag any record (client, ticket, service) globally. A malicious user could pollute Company B's data with offensive tags or disrupt organization.
- **Location:** `supabase/migrations/20260106110000_unified_tags_schema.sql`
- **Mitigation:** Add `company_id` to `item_tags`, backfill data, and enforce strict RLS.

### 3. [HIGH] Auth User ID Mismatch
- **Risk:** Policies on `app_settings` and `client_variant_assignments` compare `public.users.id` with `auth.uid()`.
- **Impact:** Since `public.users.id` is a generated UUID and `auth.uid()` is the Auth Service UUID, these values never match. This results in effective Denial of Service (nobody can access these records) or potential collisions.
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Mitigation:** Update policies to compare `public.users.auth_user_id` with `auth.uid()`.

### 4. [HIGH] IDOR in VeriFactu Dispatcher Debug Endpoints
- **Risk:** The `verifactu-dispatcher` Edge Function exposes debug actions (`debug-aeat-process`, etc.) that accept a `company_id` without verifying if the caller belongs to that company.
- **Impact:** An attacker could dump sensitive tax/invoice event logs and AEAT certificate metadata for any company.
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Mitigation:** Implement `requireCompanyAccess` helper and apply it to all debug actions.

## Planned Remediation
1.  **Database Migration:** A comprehensive SQL migration will be applied to fix the RLS policies and schema for `payment_integrations`, `item_tags`, `app_settings`, and `client_variant_assignments`.
2.  **Edge Function Patch:** The `verifactu-dispatcher` function will be patched to enforce strict company membership checks.

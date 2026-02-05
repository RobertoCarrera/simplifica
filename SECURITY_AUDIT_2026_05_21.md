# Security Audit Report - 2026-05-21

**Auditor:** Jules (AI Security Engineer)
**Date:** May 21, 2026
**Scope:** RLS Policies, Edge Functions, Financial Logic.

## Executive Summary
Critical vulnerabilities were identified in the Row Level Security (RLS) policies of `payment_integrations` and `domains` tables, allowing potential cross-tenant data access and modification. Additionally, a High-risk configuration issue was found in `create-payment-link` Edge Function where a default encryption key fallback was used.

## Findings

### 1. [CRITICAL] Cross-Tenant Access in `payment_integrations`
- **Description:** The RLS policies (`select`, `insert`, `update`, `delete`) for `payment_integrations` created in migration `20260111130000` restrict access to 'admins', but fail to filter by `company_id`.
- **Impact:** An administrator of Company A can read, modify, or delete payment integrations (including encrypted credentials) of Company B. This could lead to service disruption or credential theft/replacement.
- **Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Policies `payment_integrations_select`, etc.)
- **Proposed Fix:** Add `AND u.company_id = payment_integrations.company_id` to the RLS policy conditions.

### 2. [CRITICAL] Cross-Tenant Management of `domains`
- **Description:** The policy `Admins can manage all domains` checks if the user is an admin but does not verify that the domain belongs to the admin's company (via `assigned_to_user`).
- **Impact:** An administrator can modify or delete domains verified by other companies.
- **Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Proposed Fix:** Enforce company ownership by joining `public.users` on `assigned_to_user` and comparing `company_id`.

### 3. [HIGH] Hardcoded Encryption Key Fallback in `create-payment-link`
- **Description:** The Edge Function `create-payment-link` initializes `ENCRYPTION_KEY` with a fallback default value (`"default-dev-key-change-in-prod"`) if the environment variable is missing.
- **Impact:** If the environment variable is accidentally unset in production, the system will silently revert to a known insecure key, compromising the encryption of payment credentials.
- **Affected File:** `supabase/functions/create-payment-link/index.ts`
- **Proposed Fix:** Remove the fallback and explicitly throw an error if the key is missing.

### 4. [HIGH] Cross-Tenant Read Access in `scheduled_jobs`
- **Description:** The policy `scheduled_jobs_read` allows any admin to read all scheduled jobs. The table lacks a `company_id` column or the policy ignores it.
- **Impact:** Information disclosure of pending tasks (e.g., quote conversions) of other companies.
- **Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Proposed Fix:** Add `company_id` to `scheduled_jobs` and enforce it in RLS. (Deferred to next sprint to prioritize Critical RLS fixes).

## Action Plan
1. Apply immediate RLS fixes for `payment_integrations` and `domains`.
2. Patch `create-payment-link` to enforce secure configuration.

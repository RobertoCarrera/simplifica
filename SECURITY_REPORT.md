# Security Audit Report - April 2026

## Executive Summary
A recurrent security audit was performed on the "Simplifica" CRM codebase. Several Critical and High severity issues were identified, primarily related to multi-tenancy isolation (RLS) and Edge Function security. Immediate remediation is required for cross-tenant data leaks and exposed debug endpoints.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Description:** The RLS policy `payment_integrations_select` (and others) grants access to any authenticated user who has an 'admin' or 'owner' role in *any* company context, without restricting access to the specific company that owns the integration record.
- **Impact:** An admin of Company A can view payment secrets (Stripe/PayPal keys) of Company B.
- **Remediation:** Update RLS policies to enforce `company_id` matching via `company_members`.

### 2. [CRITICAL] Dangerous Debug Endpoints in `verifactu-dispatcher`
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The Edge Function exposes unauthenticated or weakly authenticated debug actions: `debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`, and `diag`. These use the Service Role (`admin` client) to fetch/modify data based on input parameters without verifying the caller's ownership of the target company/invoice.
- **Impact:** IDOR (Insecure Direct Object Reference), sensitive configuration exposure (environment variables), and potential data corruption.
- **Remediation:** Remove all debug endpoints. Implement strict RLS/ownership checks for `test-cert` and `retry` actions.

### 3. [HIGH] Legacy Security Logic in `convert_quote_to_invoice`
- **Location:** `supabase/migrations/20260129160000_finance_security_logic.sql`
- **Description:** The RPC `convert_quote_to_invoice` relies on `public.users.company_id` to validate staff access. This column is deprecated in favor of the `company_members` table for multi-tenant support.
- **Impact:** Users belonging to multiple companies may be denied access to legitimate resources, or potentially granted access to the wrong company context if the legacy column is out of sync.
- **Remediation:** Refactor the RPC to query `public.company_members`.

### 4. [HIGH] Legacy RLS in `verifactu_settings`
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Description:** Similar to `payment_integrations`, the RLS policies for `verifactu_settings` rely on `u.company_id` (legacy) instead of checking `company_members`.
- **Impact:** Broken access for multi-company users; potential security confusion.
- **Remediation:** Update policies to use `company_members`.

## Recommendations
1. **Immediate:** Apply the proposed migration to fix `payment_integrations` RLS.
2. **Immediate:** Deploy the patched `verifactu-dispatcher` function.
3. **Short-term:** Refactor `convert_quote_to_invoice` and `verifactu_settings` RLS.
4. **Long-term:** Audit all remaining usages of `public.users.company_id` and remove the column to prevent regression.

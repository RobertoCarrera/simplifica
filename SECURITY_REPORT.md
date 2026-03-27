# Security Report - Simplifica CRM

## Executive Summary
This audit identified **CRITICAL** vulnerabilities in the Data Layer (RLS) that allow cross-tenant data access. Specifically, the `payment_integrations` table exposes sensitive credentials to all authenticated users regardless of company affiliation. Additionally, the `item_tags` table is globally readable and writable by any user, exposing business intelligence data.
High-risk debug endpoints were also found in the `verifactu-dispatcher` Edge Function.

## Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
- **Files**: `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Description**: The RLS policies for `payment_integrations` allow any user with `admin` or `owner` role in *their* company to view payment integrations of *all* companies. The policy checks the user's role but fails to cross-reference the `company_id`.
- **Impact**: Malicious tenant admins can steal Stripe/PayPal credentials of other tenants.

### 2. Global Data Leak in `item_tags` (CRITICAL)
- **Files**: `supabase/migrations/20260106110000_unified_tags_schema.sql`
- **Description**: RLS policies are set to `USING (true)` and `WITH CHECK (true)` for all authenticated users.
- **Impact**: Any user can view, create, modify, or delete tags for any record (clients, tickets, etc.) in the system, potentially mapping out other companies' data structures.

### 3. Debug Endpoints in `verifactu-dispatcher` (HIGH)
- **Files**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: The function exposes `debug-test-update`, `debug-env`, and other actions without authentication or role checks.
- **Impact**: Attackers can manipulate invoice reporting status, reset events, and inspect environment configurations.

## Recommendations
1.  **Immediate Fix**: Apply RLS patches to `payment_integrations` to enforce `company_id` checks.
2.  **Immediate Fix**: Add `company_id` to `item_tags`, backfill data, and restrict RLS.
3.  **Remediation**: Remove debug code from `verifactu-dispatcher` or wrap it in a strict Super Admin check.

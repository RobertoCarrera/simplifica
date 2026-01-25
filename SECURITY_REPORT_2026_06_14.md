# SECURITY REPORT - 2026-06-14

## Executive Summary
This audit focused on Multi-tenancy (RLS), Edge Functions security, and Financial Logic integrity. The most critical finding is the continued reliance on the deprecated `public.users.company_id` column in both database stored procedures and Edge Functions, which compromises multi-tenant isolation.

## Findings

### 1. CRITICAL: Insecure Authorization in `convert_quote_to_invoice`
- **Location**: `supabase/migrations/20260129160000_finance_security_logic.sql` (Function: `convert_quote_to_invoice`)
- **Risk**: The function determines staff access by querying `public.users.company_id`. This column is deprecated. If this column is not updated or is manipulated, it could allow cross-tenant access or privilege escalation.
- **Remediation**: Update the function to validate access via `public.company_members` table, ensuring the user has an 'active' status in the target company.

### 2. HIGH: Deprecated Authorization in `verifactu-dispatcher`
- **Location**: `supabase/functions/verifactu-dispatcher/index.ts` (Action: `list-registry`)
- **Risk**: The `list-registry` endpoint, which exposes sensitive tax registry data, resolves the user's company using `public.users.company_id`.
- **Remediation**: Refactor to look up the `company_id` via `public.company_members` using the `public.users.id` (mapped from `auth.uid()`).

### 3. HIGH: Deprecated Authorization in `upload-verifactu-cert`
- **Location**: `supabase/functions/upload-verifactu-cert/index.ts`
- **Risk**: Similar to `verifactu-dispatcher`, this function uses `public.users.company_id` and legacy `role` column checks.
- **Remediation**: Should be refactored to use `company_members` and `app_roles`. ( deferred to future PR to keep scope small).

### 4. MEDIUM: Service Role Fallback in `invoices-pdf`
- **Location**: `supabase/functions/invoices-pdf/index.ts`
- **Risk**: The function attempts to fetch invoice items using the user's token (RLS). If few items are found, it falls back to `SUPABASE_SERVICE_ROLE_KEY` to fetch items. While this might be intended to handle specific RLS limitations, it bypasses security controls and could expose hidden items.
- **Remediation**: Investigate why RLS trims items and fix the root cause instead of using a service role bypass.

## Action Plan
This PR addresses Findings #1 and #2 as they represent the most immediate risks to tenant isolation.

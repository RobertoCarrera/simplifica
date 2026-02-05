# Security Audit Report - April 2026

## Executive Summary
A recurring security audit was performed on the Simplifica CRM codebase. Critical vulnerabilities were identified in Edge Functions regarding unauthorized access (IDOR) and RLS bypass mechanisms. Additionally, legacy authorization patterns relying on deprecated columns were found.

## Findings

### 1. CRITICAL: Insecure Debug Endpoints in `verifactu-dispatcher`
- **Component**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Issue**: The function exposes debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`) that accept a `company_id` payload without performing any authorization check against the caller.
- **Risk**: IDOR / Unauthenticated Access. An attacker could view environment variables, read/modify VeriFactu events, and trigger AEAT processes for any company.
- **Remediation**: Remove these debug endpoints immediately.

### 2. HIGH: RLS Bypass in `invoices-pdf`
- **Component**: `supabase/functions/invoices-pdf/index.ts`
- **Issue**: The function contains a fallback mechanism that uses the `service_role` key to fetch `invoice_items` if the user-scoped query returns few or no items.
- **Risk**: Data Leak. If RLS policies intentionally hide items from a user, this fallback bypasses those policies, potentially exposing sensitive line items.
- **Remediation**: Remove the service role fallback. The function should strictly respect RLS.

### 3. HIGH: Legacy Authorization in `convert_quote_to_invoice`
- **Component**: Database RPC `convert_quote_to_invoice`
- **Issue**: The function relies on the deprecated `public.users.company_id` column to authorize the operation, instead of validating against `public.company_members`.
- **Risk**: Authorization Bypass. If `users.company_id` is stale or manipulated, a user might perform operations on companies they are no longer members of.
- **Remediation**: Update the RPC to check `company_members` table.

### 4. MEDIUM: Legacy Authorization in `payment-integrations-test`
- **Component**: `supabase/functions/payment-integrations-test/index.ts`
- **Issue**: Authorization checks rely on `users.company_id` instead of `company_members`.
- **Risk**: Inconsistent Access Control. Similar to the RPC issue, this relies on a deprecated field.
- **Remediation**: Update to validate against `company_members`.

### 5. MEDIUM: Integrations Scope
- **Component**: `public.integrations` table
- **Issue**: The table is scoped to `user_id` only, without `company_id`.
- **Risk**: Potential Business Logic Issue. If integrations are meant to be company-wide resources, this design isolates them to individual users.

## Action Plan
1. **Immediate Fixes (PR 1)**: Remove insecure debug endpoints in `verifactu-dispatcher` and RLS bypass in `invoices-pdf`.
2. **Follow-up**: Address legacy authorization in `convert_quote_to_invoice` and `payment-integrations-test`.

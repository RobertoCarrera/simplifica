# Security Report - June 15, 2026

## Executive Summary
This audit focused on Multi-tenancy (RLS), Edge Functions, and Financial Logic. Critical vulnerabilities were identified regarding reliance on deprecated data structures (`public.users.company_id`) and missing RLS policies on child tables.

## Findings

### 1. Critical: Insecure Multi-tenancy in `verifactu-dispatcher`
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts` (Action: `list-registry`)
- **Issue:** The function derives the user's `company_id` by querying `public.users.company_id`. This column is deprecated and does not support users belonging to multiple companies or correctly enforce active membership status.
- **Risk:** Potential for users to access VeriFactu records of a previous company if their `users.company_id` is not cleared upon removal, or cross-tenant data leakage in multi-company scenarios.
- **Remediation:** Refactor to query `public.company_members`.

### 2. Critical: Insecure Financial Logic in `convert_quote_to_invoice`
- **Location:** Database RPC `convert_quote_to_invoice`
- **Issue:** The function validates authorization by checking `public.users.company_id`.
- **Risk:** Unauthorized conversion of quotes to invoices if the user profile state is inconsistent with `company_members`.
- **Remediation:** Update the RPC to validate against `public.company_members`.

### 3. High: Missing RLS on Child Tables (`invoice_items`)
- **Location:** Database Tables `public.invoice_items`, `public.quote_items`
- **Issue:** Migration history suggests RLS policies for these tables may be missing or were reverted.
- **Evidence:** `supabase/functions/invoices-pdf/index.ts` implements a service-role fallback for fetching items, implying unreliable access via standard RLS.
- **Risk:** An attacker guessing an `invoice_id` (or `item_id`) could potentially read or manipulate line items if they bypass the parent object check.
- **Remediation:** Enforce delegated RLS policies (check parent `invoices.company_id` via `company_members`).

### 4. Medium: RLS Bypass in `invoices-pdf`
- **Location:** `supabase/functions/invoices-pdf/index.ts`
- **Issue:** The function falls back to `SUPABASE_SERVICE_ROLE_KEY` to fetch `invoice_items` if the user-scoped query returns few results.
- **Risk:** Masks underlying RLS misconfigurations and technically violates "deny by default" principles, though impact is mitigated by the parent invoice check.
- **Remediation:** Remove fallback once RLS on `invoice_items` is confirmed robust.

## Action Plan
1. Refactor `verifactu-dispatcher` to use `company_members`.
2. Apply migration `20260615000000_secure_rpc_and_items.sql` to fix the RPC and enforce RLS on child tables.

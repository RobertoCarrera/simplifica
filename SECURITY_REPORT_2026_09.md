# SECURITY REPORT - SEPTEMBER 2026

## Executive Summary
This audit identified critical vulnerabilities in the RLS implementation and Edge Functions of the "Simplifica" CRM. The most severe issues involve broken access controls that could prevent legitimate users from accessing their data (Availability) and IDOR vulnerabilities in debug endpoints that could expose sensitive company data (Confidentiality).

## Findings

### 1. CRITICAL: Broken RLS Policies (UUID Mismatch)
**Affected Resources:** `invoices`, `quotes` tables.
**Risk:** Users cannot see or manage their invoices/quotes.
**Description:**
Recent migrations introduced RLS policies that compare `public.company_members.user_id` (a UUID referencing `public.users.id`) directly with `auth.uid()` (the Supabase Auth UUID). These are distinct values. The comparison always fails, resulting in an effective Denial of Service for all company members.
**Mitigation:** Update policies to map `auth.uid()` to `public.users.id` before querying `company_members`.

### 2. CRITICAL: Missing/Weak RLS on Child Tables
**Affected Resources:** `invoice_items`, `quote_items`.
**Risk:** Potential unauthorized access or modification of line items.
**Description:**
These tables lack explicit RLS policies in the recent migrations. If RLS is enabled but no policies exist, access is blocked (good). If RLS is disabled, access is open (bad). Given the pattern, they likely need explicit policies that inherit permissions from their parent tables (`invoices`/`quotes`) to allow legitimate access.
**Mitigation:** Enable RLS and add policies using `EXISTS` checks against the parent table and `company_members`.

### 3. HIGH: IDOR in `verifactu-dispatcher` Debug Endpoints
**Affected Resources:** `verifactu-dispatcher` Edge Function.
**Risk:** Unauthorized access to VeriFactu certificates and invoice data of any company.
**Description:**
The function exposes debug endpoints (e.g., `debug-aeat-process`, `test-cert`) that accept a `company_id` in the request body and use the Service Role key to fetch sensitive data (certificates, settings, events). There is no verification that the caller belongs to the requested company.
**Mitigation:** Remove these endpoints or enforce strict authorization using `company_members`.

### 4. MEDIUM: Reliance on Deprecated `users.company_id`
**Affected Resources:** `verifactu-dispatcher` (`list-registry`), `convert_quote_to_invoice` database function.
**Risk:** Logic failure in multi-tenant scenarios or if the deprecated column is NULL.
**Description:**
Several critical paths rely on `public.users.company_id` to determine a user's company. This column is deprecated in favor of the `company_members` table (supporting M:N relationships).
**Mitigation:** Refactor logic to query `company_members` to resolve the active company for the user.

## Proposed Actions
1. **Immediate Migration:** Fix RLS policies on `invoices`, `quotes` and secure `invoice_items`, `quote_items`. Fix `convert_quote_to_invoice`.
2. **Code Fix:** Patch `verifactu-dispatcher` to remove insecure endpoints and fix `list-registry`.

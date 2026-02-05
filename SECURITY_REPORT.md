# Security Audit Report - 2026-01-30

## Executive Summary
This audit focused on RLS policies, Multi-tenancy enforcement, and Edge Function security. Critical vulnerabilities were identified in the `verifactu-dispatcher` function (IDOR) and in the financial logic `convert_quote_to_invoice` (reliance on deprecated schema).

## Findings

### 1. Critical: IDOR in `verifactu-dispatcher` Debug Endpoints
- **File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: Several debug actions (`debug-test-update`, `debug-aeat-process`, `debug-last-event`) accept a `company_id` in the request body and use the `admin` (Service Role) client to fetch/modify data for that company without verifying if the authenticated user belongs to it.
- **Impact**: Any authenticated user (or anyone with the anon key if RLS isn't checked implicitly elsewhere, though `serve` verifies token existence) could potentially view or manipulate VeriFactu events for any company.
- **Remediation**: Enforce strict checks that `auth.uid()` is an active member of the target `company_id` before executing these actions.

### 2. High: Dependency on Deprecated `public.users.company_id`
- **File**: `supabase/functions/verifactu-dispatcher/index.ts` (list-registry) & `convert_quote_to_invoice` (RPC)
- **Description**: Both the Edge Function logic for listing registry entries and the database RPC for converting quotes to invoices rely on `public.users.company_id`. This column is deprecated in favor of `public.company_members`.
- **Impact**:
  - **Availability**: Users migrated to the new multi-tenant structure may receive errors or empty results.
  - **Security**: If the column contains stale data, users might be authorized against an old company instead of their current active memberships.
- **Remediation**: Update queries to resolve `company_id` via `public.company_members` joining on `public.users.id`.

### 3. Medium: Excessive use of Service Role Key
- **File**: Various Edge Functions
- **Description**: Functions often default to `createClient(url, service_role_key)` for convenience.
- **Impact**: Increases the blast radius of any logic error or injection vulnerability.
- **Remediation**: Use `createClient(url, anon_key, { global: { headers: { Authorization: ... } } })` to forward the user's JWT and let RLS handle permissions whenever accessing user-facing data.

## Plan of Action
1. **Immediate**: Fix `convert_quote_to_invoice` to use `company_members`.
2. **Immediate**: Patch `verifactu-dispatcher` to remove IDOR and fix company lookup.

# Security Audit Report - Simplifica CRM

**Date:** May 2026
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A security audit was performed on the Simplifica CRM codebase, focusing on RLS policies and Edge Functions. Critical vulnerabilities were identified in the multi-tenancy enforcement of child tables and the authorization logic of background processing functions.

## Findings

### 1. Missing RLS on Critical Child Tables (CRITICAL)
**Files Afected:** `invoice_items`, `quote_items`, `payment_integrations`, `verifactu_settings` (Database Tables)
**Risk:** High.
**Description:**
These tables currently lack explicit RLS policies (or potentially even RLS enablement).
- `invoice_items` and `quote_items` do not have a `company_id` column and must rely on their parent tables (`invoices`, `quotes`) for security. Without RLS, these are potentially accessible to any authenticated user if the default policy is permissive, or inaccessible if default deny is on (causing functionality breakage).
- `payment_integrations` and `verifactu_settings` contain sensitive credentials (API keys, certificates) and likely lack RLS policies to restrict access to the owning company.

**Mitigation:**
- Enable RLS on all listed tables.
- Add `USING` policies for `invoice_items`/`quote_items` that check existence of the parent record in the user's accessible scope.
- Add `company_id` based policies for `payment_integrations`/`verifactu_settings`.

### 2. IDOR in `verifactu-dispatcher` Debug Endpoints (CRITICAL)
**Files Afected:** `supabase/functions/verifactu-dispatcher/index.ts`
**Risk:** Critical.
**Description:**
The Edge Function exposes debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`) that accept a `company_id` in the request body and use the `service_role` client to perform operations.
Any authenticated user (or potentially unauthenticated if the function is public) can trigger these actions against ANY company by simply guessing or knowing the `company_id`.
This allows:
- Viewing sensitive VeriFactu event logs.
- Triggering AEAT processes with another company's certificate.
- Modifying event states (via `debug-test-update`).

**Mitigation:**
- Remove `debug-test-update` and `debug-last-event` entirely.
- Secure `debug-aeat-process` and `test-cert` by implementing strict authorization that verifies the caller is a member of the requested `company_id`.

### 3. Service Role Abuse in `invoices-pdf` (HIGH)
**Files Afected:** `supabase/functions/invoices-pdf/index.ts`
**Risk:** High.
**Description:**
The function attempts to fetch `invoice_items` using the user's client. If it returns 1 or fewer items (potentially due to RLS blocking), it falls back to using the `service_role` client to fetch all items.
This creates a bypass where, if RLS is correctly blocking access, the code intentionally circumvents it. While the invoice existence is checked first, this pattern defeats the purpose of "Defense in Depth" provided by RLS.

**Mitigation:**
- Remove the Service Role fallback. The function must rely solely on the user's permissions. If items are not returned, it is a database configuration issue (RLS) that needs fixing, not a code bypass.

## Planned Remediation
1. **Migration:** `20260501000000_secure_child_tables.sql` to apply missing RLS policies.
2. **Code Fixes:**
   - Refactor `invoices-pdf` to remove admin fallback.
   - Refactor `verifactu-dispatcher` to remove/secure debug endpoints.

# Security Audit Report - 2026-03-08

## Summary
This report details the findings of the recurring security audit performed on the Simplifica CRM codebase. The audit focused on RLS policies, Edge Functions, and financial logic.

**Date:** March 8, 2026
**Auditor:** Jules (AI Security Engineer)

## Findings

### 1. [CRITICAL] `payment_integrations` RLS Cross-Tenant Access
- **Risk:** Critical.
- **Description:** The RLS policies for `payment_integrations` (created in `20260111130000_remove_legacy_role_column.sql`) allow `TO public` access (later restricted to authenticated in definition but effectively broad) and check if the user is an admin/owner but **fail to check if the user belongs to the same company** as the integration record.
- **Impact:** Any admin of *any* company can view, modify, or delete payment integration credentials (API keys, secrets) of *all* other companies.
- **Remediation:** Enforce strict `company_id` matching against `public.company_members` in all RLS policies.

### 2. [CRITICAL] `verifactu-dispatcher` Insecure Debug Endpoints
- **Risk:** Critical.
- **Description:** The Edge Function `verifactu-dispatcher` exposes several debug actions (`debug-test-update`, `debug-env`, `debug-last-event`, `diag`, `debug-aeat-process`) via POST requests. These endpoints do not perform any authentication or authorization checks.
- **Impact:** IDOR (Insecure Direct Object Reference) allowing any attacker to read/modify VeriFactu events, reset event status, and potentially leak environment variables (though `debug-env` seems to filter some, it's still information disclosure).
- **Remediation:** Remove all debug endpoints from the production function.

### 3. [HIGH] `invoices-pdf` RLS Bypass via Service Role
- **Risk:** High.
- **Description:** The `invoices-pdf` Edge Function falls back to using the Service Role (`admin` client) to fetch `invoice_items` if the user-scoped query returns few items.
- **Impact:** This bypasses Row Level Security. If RLS policies prevented the user from seeing those items (e.g., due to strict multi-tenancy or permissions), the function essentially leaks them.
- **Remediation:** Remove the fallback logic. The function should strictly respect the authenticated user's access rights.

### 4. [HIGH] Deprecated `users.company_id` Column Usage
- **Risk:** High.
- **Description:** The deprecated column `public.users.company_id` is still used for authorization in:
  - `import-customers` Edge Function.
  - `convert_quote_to_invoice` Database Function (SQL).
- **Impact:** Authorization logic may fail or be inconsistent if the system relies on `company_members` for multi-tenancy (which supports N:M relations, whereas `users.company_id` implies 1:1). This creates ambiguity and potential access control flaws.
- **Remediation:** Update logic to use `public.company_members` for resolving company context and checking permissions.

### 5. [MEDIUM] Inconsistent Auth/RLS in `payment_integrations` policies (TO PUBLIC)
- **Risk:** Medium.
- **Description:** Some policies for `payment_integrations` were defined as `TO public`, relying on the `USING` clause for security.
- **Impact:** While `USING` clauses protect data, `TO authenticated` is preferred to prevent any unauthenticated interaction surface.
- **Remediation:** Change policy scope to `TO authenticated`.

## Action Plan
1. Fix `payment_integrations` RLS (Priority: Critical).
2. Secure `verifactu-dispatcher` by removing debug endpoints (Priority: Critical).
3. (Future) Fix `invoices-pdf` RLS bypass.
4. (Future) Refactor `import-customers` and `convert_quote_to_invoice`.

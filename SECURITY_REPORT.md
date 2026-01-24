# Security Audit Report - April 2026 (Regression Check)

## Executive Summary
A security audit was performed on the "Simplifica" codebase, focusing on RLS regressions and Edge Function security. Critical vulnerabilities were identified, seemingly resulting from a regression where previous security fixes (from March/April 2026) are missing from the current codebase.

## Findings

### 1. CRITICAL: Cross-Tenant Data Leak in `payment_integrations` (RLS)
**Severity:** Critical
**Component:** Database (RLS)
**Description:**
The RLS policy `payment_integrations_select` (defined in `20260111130000_remove_legacy_role_column.sql`) allows any user with an 'admin' or 'owner' role to view **all** rows in the `payment_integrations` table, regardless of which company they belong to.
**Vulnerability:**
The policy checks `EXISTS (SELECT 1 FROM public.users ... WHERE ar.name IN ('owner', ...))` but fails to correlate the user's company with the `payment_integrations.company_id`.
**Impact:** An administrator of Company A can view payment credentials (API keys, secrets) of Company B.

### 2. CRITICAL: IDOR / RCE via `verifactu-dispatcher` Debug Endpoints
**Severity:** Critical
**Component:** Edge Functions (`verifactu-dispatcher`)
**Description:**
The `verifactu-dispatcher` function contains "debug" endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`) that accept a `company_id` in the JSON body and perform read/write operations using the `SupabaseClient` with `SERVICE_ROLE_KEY`.
**Vulnerability:**
These endpoints perform **no checks** to verify if the caller is authorized to access the provided `company_id`. Any user (or anyone with the function URL and a valid anon/user token) can trigger these actions.
**Impact:**
- **Data Integrity:** Attackers can modify `verifactu.events` status (e.g., force a "rejected" status).
- **Data Leakage:** Attackers can retrieve the last event payload for any company.
- **Environment Leakage:** `debug-env` exposes internal configuration.

### 3. HIGH: Deprecated Single-Tenant Authorization in `verifactu_settings`
**Severity:** High
**Component:** Database (RLS)
**Description:**
The RLS policies for `verifactu_settings` rely on `u.company_id = verifactu_settings.company_id`. The `public.users.company_id` column is a deprecated legacy artifact. In a multi-tenant system where users are managed via `company_members` (N:M relationship), relying on this column prevents legitimate access for multi-company users or, worse, grants incorrect access if the column is out of sync.
**Remediation:** Policies must use `public.company_members`.

### 4. MEDIUM: Service Role Fallback in `invoices-pdf`
**Severity:** Medium
**Component:** Edge Functions (`invoices-pdf`)
**Description:**
The function falls back to using the `service_role` client to fetch `invoice_items` if the user-scoped client returns few items. While this is likely a workaround for an RLS issue, it bypasses the security model.
**Mitigation:** Ensure RLS on `invoice_items` is correct so the workaround can be removed.

## Proposed Actions
1. **Immediate:** Remove debug endpoints from `verifactu-dispatcher`.
2. **Immediate:** Patch RLS policies for `payment_integrations` and `verifactu_settings` to strictly enforce `company_members` checks.

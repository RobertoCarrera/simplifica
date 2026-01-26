# Security Report - February 2027

## Summary
**CRITICAL REGRESSION IDENTIFIED:** The repository environment has reverted to a state resembling January 2026. Multiple critical security patches applied throughout 2026 (May, June, July, August, October, December) and January 2027 are missing. This exposes the system to severe vulnerabilities previously identified and fixed.

## Findings

### 1. RLS Policy UUID Mismatch & Broken Multi-tenancy (CRITICAL)
- **Description:** `public.company_members` RLS policies compare `user_id` (foreign key to `public.users.id`) directly with `auth.uid()` (auth user UUID).
- **Risk:** Since `public.users.id` and `auth.users.id` are distinct UUIDs, this comparison fails, effectively locking legitimate users out of their companies or potentially allowing incorrect access if collisions occurred (unlikely but logic is flawed).
- **Affected Tables:** `company_members` (and all tables relying on it for access control: `invoices`, `quotes`, etc.).
- **Status:** **REGRESSION**. Fixed in Jan 2027 but reverted.

### 2. Missing RLS on Sensitive Child Tables (CRITICAL)
- **Description:** Child tables `invoice_items` and `quote_items` appear to lack RLS policies entirely.
- **Risk:** If RLS is not enabled or no policies exist, these tables might be:
    - Publicly accessible (if RLS disabled).
    - Inaccessible (if RLS enabled but no policies).
    - If `public` role has access, this is a massive data leak.
- **Status:** **REGRESSION**. Fixed in Feb, July, and Oct 2026 but reverted.

### 3. IDOR in `verifactu-dispatcher` Debug Endpoints (CRITICAL)
- **Description:** The `verifactu-dispatcher` Edge Function exposes debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) that accept a `company_id` in the request body and use the `SUPABASE_SERVICE_ROLE_KEY` to query data.
- **Risk:** Any authenticated user can access sensitive VeriFactu data, certificates, and event logs of *any* other company by simply changing the `company_id` payload.
- **Status:** **REGRESSION**. Patched in Feb, June, Oct, Dec 2026 and Jan 2027 but reverted.

### 4. Edge Functions Security (High)
- **Description:** General reliance on `SUPABASE_SERVICE_ROLE_KEY` without strict authorization checks in older function versions.
- **Status:** Needs review across all functions.

## Recommended Actions (Immediate)

1.  **Restore RLS Integrity:**
    - Apply a migration to fix the `company_members` policy to properly map `auth.uid()` -> `public.users.id`.
    - Enable RLS on `invoice_items` and `quote_items` and add policies that inherit access from their parent tables.

2.  **Patch VeriFactu Dispatcher:**
    - Implement strict `requireCompanyAccess(company_id)` checks in all debug endpoints.
    - Ensure `SUPABASE_ANON_KEY` + User Token is used where possible, or explicit validation is performed before using Service Role.

3.  **Audit Other Functions:**
    - Re-audit `aws-manager` and others for similar regressions.

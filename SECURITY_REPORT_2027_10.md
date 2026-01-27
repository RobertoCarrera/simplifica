# Security Audit Report - October 2027

## Summary
A recurring system regression has reverted the codebase to a January 2026 state, effectively undoing months of critical security patches. This audit identifies major vulnerabilities that have resurfaced.

## Critical Findings

### 1. IDOR in `verifactu-dispatcher` (Edge Function)
**Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:** The debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) use the `admin` (Service Role) client to access data based solely on the `company_id` provided in the request body. There is no validation that the authenticated user belongs to that company.
**Impact:** Any authenticated user can read sensitive VeriFactu events, certificates, and trigger updates for any company by guessing the `company_id`.
**Remediation:** Implement `requireCompanyAccess(company_id)` using a user-scoped client (via `Authorization` header) to validate membership before processing these requests.

### 2. Missing RLS on Child Tables (Regression)
**Affected Tables:** `invoice_items`, `quote_items`
**Description:** Due to the regression, the Row Level Security (RLS) policies that secured these child tables have been lost. They likely have no RLS enabled or default permissive policies, meaning they might be accessible to any authenticated user or not properly scoped to the company.
**Impact:** Potential data leakage of invoice lines and quote details across tenants.
**Remediation:** Re-apply the migration to enable RLS and add policies that join with parent tables (`invoices`, `quotes`) to check `company_members` permissions.

## High Priority Findings

### 3. Service Role Usage in Edge Functions
**Description:** Several Edge Functions (e.g., `verifactu-dispatcher`) initialize the `admin` client globally or broadly. While necessary for some background tasks, this increases the risk if input validation is missed (as seen in the IDOR above).
**Remediation:** Minimize Service Role usage. When possible, use `createClient` with `SUPABASE_ANON_KEY` and the user's `Authorization` header to inherit RLS contexts.

## Plan of Action
1.  **Immediate Fix:** Create a migration to secure `invoice_items` and `quote_items`.
2.  **Immediate Fix:** Patch `verifactu-dispatcher` to enforce company access checks on debug endpoints.

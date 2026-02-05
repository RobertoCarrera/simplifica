# Security Report - March 2028 Audit

## Executive Summary
This audit has identified **critical regressions** in the `Simplifica` codebase, which appears to have reverted to a state resembling January 2026. This regression has re-exposed previously patched vulnerabilities in Edge Functions and RLS policies.

**Total Critical Findings:** 2
**Total High Findings:** 2

## Detailed Findings

### 1. `aws-manager` Unauthenticated Access (CRITICAL)
- **Location:** `supabase/functions/aws-manager/index.ts`
- **Issue:** The function does not validate the `Authorization` header or checking if the user is authenticated. It allows any unauthenticated user to register domains (`register-domain`) and check availability, incurring costs and potential reputational damage. It also leaks stack traces.
- **Impact:** Remote Code Execution (via logic abuse), Uncontrolled Cost, Information Disclosure.
- **Recommendation:** Implement `supabase.auth.getUser()` check and restrict usage to authenticated users.

### 2. `verifactu-dispatcher` IDOR in Debug Endpoints (CRITICAL)
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Issue:** The function exposes multiple debug endpoints (`debug-test-update`, `debug-last-event`, `test-cert`, etc.) that accept a `company_id` in the body without verifying if the caller is a member of that company.
- **Impact:** IDOR (Insecure Direct Object Reference). An attacker can read event logs, modify retry attempts, and test certificates of other companies.
- **Recommendation:** Remove debug endpoints in production or enforce strict `company_members` checks using `requireCompanyAccess`.

### 3. Missing RLS on Child Tables (HIGH)
- **Location:** Database Schema (`invoice_items`, `quote_items`)
- **Issue:** Migrations known to secure these tables (e.g., `20271201000000_secure_invoice_items.sql`) are missing from the codebase. These tables likely lack RLS or have permissive policies, allowing potential access to line items across tenants.
- **Impact:** Data Leakage between tenants.
- **Recommendation:** Re-apply RLS policies linking child tables to `company_members` via their parent tables.

### 4. Broken Logic in `convert_quote_to_invoice` (HIGH)
- **Location:** `supabase/migrations/20260129160000_finance_security_logic.sql`
- **Issue:** The function relies on `public.users.company_id`, which is a legacy column and may be NULL for staff members who are now managed via `company_members`.
- **Impact:** Denial of Service for legitimate users trying to convert quotes.
- **Recommendation:** Update the function to check permissions via `company_members` table.

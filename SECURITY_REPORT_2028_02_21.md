# Security Audit Report - Feb 21, 2028

## Executive Summary
A security audit was performed on the Simplifica CRM repository. Critical vulnerabilities were identified in the `aws-manager` edge function (unauthenticated access, RCE risk) and `verifactu-dispatcher` (IDOR in debug endpoints).

## Findings

### 1. `aws-manager` Unauthenticated Access (CRITICAL)
- **File:** `supabase/functions/aws-manager/index.ts`
- **Issue:** The function accepts JSON payloads and executes AWS Route53 operations without validating the `Authorization` header.
- **Risk:** Unauthenticated users can register domains, check availability, or trigger other AWS actions. This also leaks stack traces, aiding attackers.
- **Remediation:** Implement `supabase.auth.getUser()` verification using the caller's JWT.

### 2. `verifactu-dispatcher` Debug IDOR (HIGH)
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Issue:** Debug actions (`debug-test-update`, `debug-aeat-process`, etc.) accept a `company_id` and perform operations using the `admin` client without checking if the caller belongs to that company.
- **Risk:** An authenticated user (or unauthenticated, if the main auth check is bypassed, though `verifactu-dispatcher` main handler seems to lack a top-level auth check for these specific branches) can manipulate VeriFactu events for any company.
- **Remediation:** Implement `requireCompanyAccess(company_id)` to enforce RLS-like checks.

### 3. Data Layer & RLS (GOOD)
- **File:** `supabase/migrations/20260129160000_finance_security_logic.sql`
- **Status:** Recent migrations have reinforced RLS on `invoices` and `company_settings`, requiring `company_members` verification.
- **Note:** `issue-invoice` correctly implements auth checks.

## Planned Actions
1. Patch `aws-manager` to enforce authentication.
2. Patch `verifactu-dispatcher` to enforce company-level authorization on debug endpoints.

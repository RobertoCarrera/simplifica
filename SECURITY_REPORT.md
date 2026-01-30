# Security Report - Simplifica CRM

## Executive Summary
This report details critical security vulnerabilities identified during the recurring audit of the Simplifica CRM codebase. The primary findings indicate a regression to an insecure state (likely Jan 2026), re-introducing high-risk vulnerabilities in Edge Functions (`verifactu-dispatcher` and `aws-manager`). These vulnerabilities expose sensitive data (IDOR) and allow unauthenticated actions.

## Findings

### 1. CRITICAL: Unauthenticated IDOR & Information Disclosure in `verifactu-dispatcher`
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Risk:** The function exposes several debug actions (`debug-env`, `debug-aeat-process`, `debug-last-event`, `debug-test-update`) that do not verify the caller's identity or authorization.
- **Impact:** An attacker can:
    - Retrieve sensitive environment variables (potentially including keys/secrets if they were dumped).
    - Access VeriFactu event logs and certificate details for any company by guessing or enumerating `company_id`.
    - Trigger arbitrary test updates to VeriFactu event status.
- **Status:** **Active Vulnerability** (Regression).

### 2. CRITICAL: Unauthenticated Domain Registration in `aws-manager`
- **File:** `supabase/functions/aws-manager/index.ts`
- **Risk:** The function processes `register-domain` and `check-availability` actions without checking the `Authorization` header or validating that the user belongs to a company.
- **Impact:** An attacker can register domains at the company's expense without authorization.
- **Status:** **Active Vulnerability** (Regression).

### 3. HIGH: Stack Trace Exposure in `aws-manager`
- **File:** `supabase/functions/aws-manager/index.ts`
- **Risk:** Error responses include `details: error.stack`.
- **Impact:** Leaks internal file paths and code structure, aiding further attacks.
- **Status:** **Active Vulnerability**.

### 4. MEDIUM: Potential RLS Gaps
- **Observation:** While `20260129160000_finance_security_logic.sql` enforces strict RLS on `invoices`, other tables need continuous monitoring.
- **Recommendation:** Continue to monitor for tables with `TO public` or `WITH CHECK (true)`.

## Proposed Plan
1.  **Immediate Fix (PR 1):** Secure `verifactu-dispatcher`.
    - Remove `debug-env` and `debug-test-update`.
    - Implement `requireCompanyAccess` for `debug-aeat-process` (if kept) and other sensitive actions.
2.  **Immediate Fix (PR 2):** Secure `aws-manager`.
    - Add `Authorization` header verification using `supabase.auth.getUser()`.
    - Enforce `company_id` checks.
    - Suppress stack traces in production errors.

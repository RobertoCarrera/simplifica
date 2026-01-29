# Security Audit Report - October 2028

## Executive Summary
This report outlines critical security vulnerabilities identified during the recurring audit of the Simplifica "aws-manager" and "verifactu-dispatcher" edge functions, as well as RLS observations.

**Immediate Action Required:** Patch `aws-manager` and `verifactu-dispatcher` to prevent unauthenticated access and data manipulation.

## Findings

### 1. `aws-manager` Unauthenticated Access (CRITICAL)
- **File:** `supabase/functions/aws-manager/index.ts`
- **Vulnerability:** The function exposes `register-domain` and `check-availability` actions without any authentication checks.
- **Impact:** Any malicious actor with the URL can register domains using the company's AWS credentials, leading to financial loss (Financial DoS) and resource hijacking.
- **Remediation:** Implement Supabase Auth (JWT) validation using `getUser()`.

### 2. `verifactu-dispatcher` Insecure Debug Endpoints (CRITICAL)
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Vulnerability:** The function contains active debug endpoints (`debug-test-update`, `debug-aeat-process`) that allow arbitrary modification of the `verifactu.events` table and leak environment details.
- **Impact:** IDOR, Privilege Escalation (modifying event status/attempts via Service Role), and Information Disclosure.
- **Remediation:** Remove all debug endpoints immediately.

### 3. `verifactu-dispatcher` Insecure Certificate Test (HIGH)
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Vulnerability:** The `test-cert` action takes a `company_id` and tests its certificate without verifying if the caller belongs to that company.
- **Impact:** IDOR/Information Disclosure. A user can verify existence of certificates for other companies and potentially infer internal state.
- **Remediation:** Implement `requireCompanyAccess` check to ensure the caller is a member of the target company.

### 4. RLS Policy Observations (MEDIUM)
- **File:** `supabase/migrations/20260129160000_finance_security_logic.sql`
- **Observation:** The RPC `convert_quote_to_invoice` relies on `public.users.company_id`. While functional, this column is deprecated in favor of `company_members` for multi-tenancy.
- **Risk:** Future breakage if `public.users.company_id` is removed, or inconsistency if a user belongs to multiple companies but `public.users` only points to one.
- **Remediation:** Update logic to query `company_members` explicitly. (Deferred for this sprint to focus on Critical issues).

## Planned Fixes
1.  **aws-manager**: Add `supabase.auth.getUser()` check.
2.  **verifactu-dispatcher**: Remove debug code and add `requireCompanyAccess` to `test-cert`.

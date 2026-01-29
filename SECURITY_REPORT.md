# Security Audit Report - Simplifica CRM

**Date:** June 2028
**Auditor:** Jules (Senior Security Engineer)

## Summary
A recurring security audit was performed on the `Simplifica` repository. Critical vulnerabilities were identified in the Edge Functions layer, specifically in `aws-manager` (unauthenticated access) and `verifactu-dispatcher` (IDOR and debug endpoints). These appear to be regressions of issues previously identified and patched in Jan-May 2028.

## Critical Findings

### 1. Unauthenticated AWS Resource Management (`aws-manager`)
*   **Severity:** **CRITICAL**
*   **Location:** `supabase/functions/aws-manager/index.ts`
*   **Issue:** The function accepts `POST` requests to register domains and check availability without any authentication. Any user with the URL can trigger AWS charges and manipulate domain resources using the project's credentials.
*   **Impact:** Financial loss (AWS charges), resource hijacking.

### 2. IDOR and Sensitive Information Leak (`verifactu-dispatcher`)
*   **Severity:** **CRITICAL**
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Issue:** The function contains active debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`, `diag`). These endpoints:
    *   Bypass authentication/authorization checks.
    *   Expose internal environment variables and configuration.
    *   Allow manipulation of invoice processing state (resetting events).
    *   Leak sample data.
*   **Impact:** Data leakage, integrity violation of tax reporting (VeriFactu), potential denial of service.

### 3. Missing Authorization in Certificate Testing (`verifactu-dispatcher`)
*   **Severity:** **HIGH**
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts` -> `test-cert` action
*   **Issue:** The `test-cert` action takes a `company_id` from the request body and attempts to decrypt and use that company's certificate. While it doesn't return the private key, it allows an attacker to enumerate valid company IDs and verify which ones have certificates configured. It does not verify if the caller is a member of that company.
*   **Impact:** Information disclosure, IDOR.

## Remediation Plan
1.  **Immediate Patch:**
    *   Implement mandatory `Authorization` header check and `supabase.auth.getUser()` verification in `aws-manager`.
    *   Remove all debug endpoints from `verifactu-dispatcher`.
    *   Implement strict `company_id` ownership checks for `test-cert` and other sensitive actions in `verifactu-dispatcher`.

2.  **Long-term:**
    *   Investigate the root cause of the recurring regression (file sync issues mentioned in historical context).
    *   Implement automated regression testing for Edge Functions.

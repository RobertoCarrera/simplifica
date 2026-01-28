# Security Audit Report - March 2028 (Recurring)

**Date:** March 07, 2028
**Auditor:** Jules (Senior Security Engineer)
**Status:** CRITICAL REGRESSION DETECTED

## Executive Summary
This recurring audit has confirmed a severe regression in the system state, effectively reverting the codebase to a "Jan 2026" snapshot. Multiple critical security patches applied in late 2027 and early 2028 are missing. Immediate remediation is required to close public access holes in Edge Functions and Database Tables.

## Critical Findings

### 1. Unauthenticated AWS Resource Access (`aws-manager`)
*   **Severity:** **CRITICAL**
*   **Description:** The `aws-manager` Edge Function reads AWS credentials from the environment but fails to validate the caller's identity. It does not check the `Authorization` header or use `supabase.auth.getUser()`.
*   **Impact:** Any attacker with the function URL can register domains or check availability using the company's AWS credentials, leading to financial loss and resource hijacking.
*   **Status:** Regression. (Previously fixed Jan 30, 2028; Feb 21, 2028).

### 2. IDOR in VeriFactu Dispatcher (`verifactu-dispatcher`)
*   **Severity:** **HIGH**
*   **Description:** The function initializes a Service Role client (`admin`) globally. Debug endpoints (e.g., `debug-aeat-process`, `debug-test-update`) accept a `company_id` in the request body and use this admin client to query/modify data for that company without verifying if the caller belongs to it.
*   **Impact:** A malicious user can view or modify tax events (VeriFactu) for any other company by guessing or enumerating `company_id`s.
*   **Status:** Regression. (Previously fixed Nov 30, 2027; Jan 30, 2028).

### 3. Missing RLS on Child Tables (`invoice_items`, `quote_items`)
*   **Severity:** **HIGH**
*   **Description:** While `invoices` and `quotes` tables have RLS policies (from Jan 2026 migrations), the line-item tables (`invoice_items`, `quote_items`) appear to lack Row Level Security policies entirely in the current migration set.
*   **Impact:** If RLS is not enabled or policies are missing, these tables may be publicly readable or writable, allowing data leakage of pricing and product details.
*   **Status:** Regression. (Previously fixed Nov 30, 2027; Dec 01, 2027).

## Remediation Plan

1.  **Patch `aws-manager`:** Enforce `Authorization` header check and user validation.
2.  **Patch `verifactu-dispatcher`:** Implement `requireCompanyAccess` to validate membership before processing debug actions.
3.  **Secure Database:** Apply a new migration to enable RLS and add parent-checking policies for `invoice_items` and `quote_items`.

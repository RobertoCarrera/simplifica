# Security Audit Report - February 2028

**Status:** CRITICAL REGRESSION DETECTED
**Date:** February 1, 2028
**Auditor:** Jules (Security Engineer)

## Executive Summary
The system has experienced a severe regression, reverting the codebase and database migrations to a state consistent with **January 2026**. This has effectively undone 2 years of security patches, re-exposing known critical vulnerabilities.

## Critical Findings

### 1. Unauthenticated Remote Code Execution in `aws-manager`
*   **Severity:** **CRITICAL**
*   **Location:** `supabase/functions/aws-manager/index.ts`
*   **Vulnerability:** The Edge Function executes AWS SDK commands (Route53, SES) based solely on the request body (`action`, `payload`). It **does not** validate the `Authorization` header or check if the caller is an authenticated user.
*   **Impact:** Any malicious actor with the function URL can register domains (billing the company account) or modify DNS records without authentication.

### 2. Missing RLS on Child Tables
*   **Severity:** **CRITICAL**
*   **Location:** Database (`invoice_items`, `quote_items`)
*   **Vulnerability:** Row Level Security (RLS) is likely disabled or missing policies for child tables. The migration `20271130000000_secure_child_tables.sql` is missing.
*   **Impact:** Even if `invoices` are protected, an attacker could potentially access line item details (prices, descriptions) directly if they guess the UUIDs, bypassing the company-level isolation.

### 3. IDOR in `verifactu-dispatcher`
*   **Severity:** **HIGH**
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Vulnerability:** Debug endpoints (e.g., `debug-aeat-process`) accept a `company_id` in the body and perform administrative actions using the `SUPABASE_SERVICE_ROLE_KEY`. There is no check to ensure the authenticated user belongs to the requested `company_id`.
*   **Impact:** A user from Company A can trigger tax submissions (AEAT) or view logs for Company B.

## Remediation Plan (Immediate)
We will open a Pull Request addressing the two most critical issues:
1.  **RLS Patch:** Re-apply RLS policies for `invoice_items` and `quote_items`.
2.  **AWS Manager Hardening:** Implement strict `Authorization` header validation and `getUser()` checks.

*Note: `verifactu-dispatcher` will be addressed in a subsequent patch cycle following the "small PR" constraint.*

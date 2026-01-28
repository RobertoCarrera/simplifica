# Security Report - May 2028 Audit

## Executive Summary
This audit has identified critical security regressions that have reverted the system to a vulnerable state resembling Jan 2026. Major protections implemented in 2027 and early 2028 are missing.

## Findings

### 1. Critical RLS Regression (High Risk)
*   **Affected Components:** Database Tables (`invoice_items`, `quote_items`)
*   **Issue:** Missing RLS policies. These tables are likely publicly readable/writable or accessible across tenants if no default deny is in place.
*   **Impact:** Data leakage between companies. A user from Company A might be able to read or modify invoice lines from Company B.
*   **Status:** **RECURRING REGRESSION**. The migration `20280401000000_secure_child_tables.sql` (and its predecessors) is missing from the codebase.

### 2. `verifactu-dispatcher` Vulnerabilities (Critical Risk)
*   **Affected Components:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Issue:**
    1.  **Backdoors:** Hardcoded debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`) allow arbitrary data modification and environment variable leakage (including keys).
    2.  **IDOR:** The debug endpoints accept `company_id` from the request body without verifying the caller's permission to access that company.
*   **Impact:** Complete compromise of VeriFactu data integrity and potential secret leakage.

### 3. `aws-manager` Unauthenticated Access (Critical Risk)
*   **Affected Components:** `supabase/functions/aws-manager/index.ts`
*   **Issue:** The function lacks **any** authentication mechanism. It processes requests from any caller who knows the URL.
*   **Impact:** Unauthorized domain registration and availability checks. Potential financial loss (AWS costs) and resource hijacking.

### 4. Frontend Security (Low/Medium Risk)
*   **Affected Components:** `src/app/guards/auth.guard.ts`
*   **Issue:** Appears standard, but relies on `AuthService`. Ensure `AuthService` doesn't expose `service_role_key`. (No direct exposure found in guards).

## Recommendations

1.  **Immediate Remediation (Priority 1):**
    *   Re-apply RLS policies for `invoice_items` and `quote_items` via a new migration.
    *   Remove all debug endpoints from `verifactu-dispatcher`.
    *   Implement Supabase Auth validation in `aws-manager`.

2.  **Process Improvement:**
    *   Investigate the root cause of the file synchronization issues causing these recurring regressions.

## Proposed Actions
I will create two PRs to address the most critical issues immediately:
1.  **RLS Fix:** A migration to secure child tables.
2.  **Edge Function Hardening:** Patching `verifactu-dispatcher` and `aws-manager`.

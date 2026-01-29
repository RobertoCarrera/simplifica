# Security Audit Report - Simplifica

Date: June 2028
Auditor: Jules (Security Engineer)

## Executive Summary
This audit identified critical security regressions in the Multi-tenancy (RLS) and Edge Function layers. The system has reverted to a state where child tables are unprotected, and debug endpoints exposing IDOR vulnerabilities are present in production code.

## Findings

### 1. Missing RLS on Child Tables (CRITICAL)
*   **Description:** Tables `invoice_items` and `quote_items` do not have Row Level Security (RLS) policies defined in the recent migrations.
*   **Impact:** Any authenticated user can potentially read, modify, or delete line items from any invoice or quote belonging to any other company, leading to data leakage and data integrity violation.
*   **Files Afected:** `supabase/migrations/*` (missing policies).

### 2. IDOR and Information Leakage in `verifactu-dispatcher` (CRITICAL)
*   **Description:** The Edge Function `verifactu-dispatcher` contains several debug endpoints (`debug-last-event`, `debug-aeat-process`, `debug-test-update`) that accept a `company_id` in the request body without verifying if the caller belongs to that company.
*   **Impact:** A malicious user can view processing events, simulation results, and potentially trigger updates for other companies (IDOR).
*   **Files Afected:** `supabase/functions/verifactu-dispatcher/index.ts`.

### 3. Unauthenticated Access in `aws-manager` (HIGH)
*   **Description:** The `aws-manager` Edge Function executes domain checks and registrations without checking the `Authorization` header.
*   **Impact:** Unauthenticated attackers can check domain availability and potentially register domains (if credits/config allow) using the platform's AWS credentials.
*   **Files Afected:** `supabase/functions/aws-manager/index.ts`.

### 4. Environment Variable Leakage (HIGH)
*   **Description:** The `debug-env` endpoint in `verifactu-dispatcher` exposes server-side configuration variables.
*   **Impact:** Information disclosure aids attackers in reconnaissance.
*   **Files Afected:** `supabase/functions/verifactu-dispatcher/index.ts`.

## Recommendations
1.  **Immediate:** Apply RLS policies to `invoice_items` and `quote_items` enforcing parent-table checks.
2.  **Immediate:** Remove all debug endpoints from `verifactu-dispatcher` and implement `requireCompanyAccess` for `test-cert`.
3.  **Immediate:** Add strict `supabase.auth.getUser()` checks to `aws-manager`.

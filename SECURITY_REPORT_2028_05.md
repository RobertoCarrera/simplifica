# Security Report - May 2028 Audit

## Executive Summary
This audit identified critical security regressions in the Edge Functions layer, specifically in `verifactu-dispatcher` and `aws-manager`. These vulnerabilities expose the system to IDOR (Insecure Direct Object Reference) and unauthenticated access, effectively reverting security patches applied in previous months. RLS policies appear largely intact and robust for core tables.

## Findings

### 1. CRITICAL: Unauthenticated Access in `aws-manager`
- **File**: `supabase/functions/aws-manager/index.ts`
- **Description**: The function allows domain registration and availability checks without any authentication or authorization. It relies solely on CORS headers.
- **Risk**: Any user (or bot) with the function URL can register domains using the company's AWS credentials, potentially incurring significant costs.
- **Remediation**: Implement Supabase Auth validation using `getUser()` and the caller's Authorization header.

### 2. CRITICAL: IDOR & Debug Endpoints in `verifactu-dispatcher`
- **File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: The function contains several "debug" endpoints (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`) that take a `company_id` in the request body and perform actions (read/write) without verifying if the caller belongs to that company.
- **Risk**: IDOR (Insecure Direct Object Reference). A malicious user could read sensitive VeriFactu event logs or trigger AEAT processes for other companies by guessing their `company_id`.
- **Remediation**: Remove all debug endpoints immediately.

### 3. HIGH: `test-cert` Endpoint Missing Authorization
- **File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: The `test-cert` action in `verifactu-dispatcher` accepts a `company_id` but does not verify if the authenticated user is a member of that company.
- **Risk**: Information disclosure regarding certificate status and configuration of other companies.
- **Remediation**: Implement a `requireCompanyAccess` check that validates the user's membership in the target company via RLS-backed query.

## Conclusion
Immediate action is required to patch the Edge Functions. The `verifactu-dispatcher` regression suggests a recurring issue with environment synchronization or deployment of old code versions.

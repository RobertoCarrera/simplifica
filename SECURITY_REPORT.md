# Security Audit Report - Simplifica CRM

**Date:** October 2028 (Simulated)
**Auditor:** Jules (AI Security Engineer)

## Executive Summary
This report highlights critical security vulnerabilities in the Edge Functions layer, specifically related to Authorization and IDOR (Insecure Direct Object References). While recent database migrations have strengthened RLS for financial data, the serverless functions expose sensitive operations without adequate checks.

## Findings

### 1. `aws-manager` Edge Function: Unauthenticated Access (CRITICAL)
- **File:** `supabase/functions/aws-manager/index.ts`
- **Description:** The function accepts POST requests to check domain availability and *register domains* without checking the `Authorization` header. Any user (or even unauthenticated actors if the function is public) can trigger domain purchases or checks.
- **Impact:** Financial loss (unauthorized domain registration), resource exhaustion, information leakage.
- **Recommendation:** Implement strict JWT validation using Supabase Auth. Ensure the user belongs to a company authorized to register domains.

### 2. `verifactu-dispatcher` Edge Function: IDOR in Debug Tools (HIGH)
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function includes several "debug" and "test" actions (`debug-test-update`, `debug-aeat-process`, `test-cert`) that accept a `company_id` payload. There is no check to ensure the authenticated user belongs to that `company_id`.
- **Impact:** A user from Company A can inspect certificates, last events, and AEAT process steps of Company B by guessing the UUID.
- **Recommendation:** Implement a `requireCompanyAccess` helper that verifies the user's membership in the target company before proceeding with any action.

### 3. `verifactu-dispatcher`: Environment Exposure (MEDIUM)
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The `debug-env` action returns the current environment configuration. While sensitive keys are masked or checked for existence, exposing internal configuration (backoff strategies, mode) is unnecessary and increases the attack surface.
- **Impact:** Information disclosure.
- **Recommendation:** Remove the `debug-env` endpoint entirely.

### 4. RLS Consistency (Ongoing Monitoring)
- **Description:** Recent migrations (`20260129160000`) have improved invoice security. However, continuous monitoring is needed to ensure `company_members` is the single source of truth for multi-tenancy, replacing legacy checks.

## Proposed Actions
1. **Secure `aws-manager`:** Add auth checks immediately.
2. **Secure `verifactu-dispatcher`:** Add `requireCompanyAccess` check to all debug/test endpoints and remove `debug-env`.

# Security Audit Report - June 2028

## Executive Summary
This audit identified critical security vulnerabilities in the `aws-manager` and `verifactu-dispatcher` Edge Functions. These vulnerabilities allow unauthenticated access to AWS resources and potential IDOR (Insecure Direct Object Reference) attacks on sensitive invoicing data.

## Findings

### 1. `aws-manager` Unauthenticated Access (CRITICAL)
**Location:** `supabase/functions/aws-manager/index.ts`
**Description:** The function exposes `check-availability` and `register-domain` actions without checking for any authentication. The `serve` function processes requests directly from `req.json()` without validating the `Authorization` header.
**Impact:** Any user (or bot) can register domains or query availability using the company's AWS credentials, leading to financial loss and resource exhaustion.
**Remediation:** Implement Supabase Auth validation using `getUser()` before processing requests.

### 2. `verifactu-dispatcher` Insecure Debug Endpoints (CRITICAL)
**Location:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:** The function contains several debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`, `diag`) that:
- Are fully accessible without specific authorization checks (beyond having the function URL).
- Leak database samples (`events_sample`, `meta_sample`) in the `diag` endpoint.
- Allow data modification (`debug-test-update`).
- Do not verify if the caller belongs to the `company_id` provided in the body (IDOR).
**Impact:** Information disclosure of invoice data and potential data integrity violation.
**Remediation:** Remove all debug endpoints in production code.

### 3. `verifactu-dispatcher` IDOR in `test-cert` (CRITICAL)
**Location:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:** The `test-cert` action accepts a `company_id` and performs operations using the `admin` client (Service Role) without verifying if the requesting user is a member of that company.
**Impact:** A malicious user could test/probe certificates of other companies by guessing `company_id`.
**Remediation:** Implement a `requireCompanyAccess` check verifying membership in `company_members`.

### 4. RLS Policy Status (Verification Needed)
**Description:** Recent migrations (`20260129160000_finance_security_logic.sql`) have strengthened `invoices` security. Ensure similar policies exist for child tables (`invoice_items`, `quote_items`) in future audits.

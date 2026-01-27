# Security Audit Report - December 2027

## Executive Summary
This audit identified **3 CRITICAL** vulnerabilities in the Simplifica CRM platform, affecting data isolation (RLS), external service authorization (`verifactu-dispatcher`), and infrastructure management (`aws-manager`). These issues expose the system to IDOR (Insecure Direct Object Reference) and unauthorized financial/infrastructure operations.

## Findings

### 1. Missing RLS on Financial Child Tables (CRITICAL)
**Affected Components:** PostgreSQL Tables (`invoice_items`, `quote_items`)
**Description:**
While parent tables `invoices` and `quotes` have RLS policies, their child tables (`invoice_items`, `quote_items`) do not have explicit policies defined in the recent migration history.
**Impact:**
- If RLS is not enabled: Full public access to all invoice lines (descriptions, prices, quantities) of all companies.
- If RLS is enabled but no policy exists: Users cannot see their own invoice lines.
**Remediation:**
- Enable RLS on these tables.
- Add policies using `EXISTS` subqueries to join with the parent table and validate `company_members` status.

### 2. IDOR in VeriFactu Dispatcher Debug Endpoints (CRITICAL)
**Affected Component:** Edge Function (`verifactu-dispatcher`)
**Description:**
The function exposes debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`) and a certificate test endpoint (`test-cert`) that accept a `company_id` payload. The function uses the `SUPABASE_SERVICE_ROLE_KEY` to execute these actions but fails to validate if the caller is a member of the requested `company_id`.
**Impact:**
- An attacker can view internal event logs, AEAT responses, and potential error details of any company.
- An attacker can trigger certificate decryption and validation tests for any company, potentially exposing sensitive metadata about the certificate state.
**Remediation:**
- Implement `requireCompanyAccess(company_id)` validation for all debug endpoints.

### 3. Unauthenticated Access to AWS Manager (CRITICAL)
**Affected Component:** Edge Function (`aws-manager`)
**Description:**
The function executes AWS commands (Domain Registration, Availability Check) via `aws-sdk` but performs **no authentication checks** on the incoming request. It does not validate the `Authorization` header.
**Impact:**
- Any user (or bot) with the function URL can check domain availability and **register domains** using the company's AWS credentials, leading to financial loss and resource hijacking.
**Remediation:**
- Instantiate a Supabase client with the user's Auth token.
- Enforce `auth.getUser()` to ensure the caller is a valid authenticated user (and ideally an Admin/Owner).

### 4. AuthGuard Error Handling (MEDIUM)
**Affected Component:** Angular (`AuthGuard`)
**Description:**
The `AuthGuard` contains a `catchError` block that returns `of(true)` (allow access) in some failure scenarios during profile loading.
**Impact:**
- In rare network error states, a user might bypass the guard (though backend RLS should still protect data).
**Remediation:**
- Change default error behavior to redirect to login or deny access.

## Proposed Actions
1. Apply RLS policies to `invoice_items` and `quote_items` immediately.
2. Patch `verifactu-dispatcher` to enforce company membership checks.
3. Patch `aws-manager` to require authentication.

# Security Report - October 2026

## Executive Summary
A recurring security audit was performed on the Simplifica CRM codebase. The audit focused on RLS policies, Edge Functions, and Financial Logic.

**Critical Findings:**
- **IDOR in `verifactu-dispatcher`**: Multiple debug and maintenance endpoints allow unauthorized access to sensitive company data and operations by simply changing the `company_id` or `invoice_id` in the request body.

**Status:**
- RLS Layer: **Secure**. Recent migrations have hardened `invoices` and `company_members` policies.
- PDF Generation: **Secure**. Checks RLS before generation.
- Payment Testing: **Secure**. Manually checks company ownership.

---

## Detailed Findings

### 1. [CRITICAL] IDOR in `verifactu-dispatcher` Edge Function

**Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`

**Description:**
The `verifactu-dispatcher` function exposes several "debug" and "test" actions that accept `company_id` or `invoice_id` as input parameters. These actions use the `admin` (service_role) client to query and modify data without verifying if the authenticated user belongs to the specified company.

**Vulnerable Actions:**
- `debug-test-update`: Allows modifying event retry counts and errors for any company.
- `debug-last-event`: Returns the full content of the last VeriFactu event for any company.
- `debug-aeat-process`: Returns sensitive configuration (NIF, environment, certificate status) and event data for any company.
- `test-cert`: Allows testing certificate decryption and AEAT connection for any company.
- `retry`: Allows resetting the status of a rejected event for any invoice.

**Impact:**
- **Data Leakage:** An attacker can view sensitive tax information (NIFs, certificates status) and invoice submission details of other companies.
- **Data Integrity:** An attacker can disrupt the VeriFactu submission process by resetting events or modifying their retry status.
- **Resource Abuse:** An attacker can trigger AEAT connection tests or submissions on behalf of other companies.

**Remediation:**
- Implement a `requireCompanyAccess(company_id)` helper that validates the user's membership in the target company.
- Apply this check to all company-scoped actions.
- Apply `requireInvoiceAccess(invoice_id)` to all invoice-scoped actions (specifically `retry`).

### 2. [HIGH] Use of Service Role Key in `verifactu-dispatcher`

**Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`

**Description:**
The function initializes a global `admin` client using `SUPABASE_SERVICE_ROLE_KEY`. While necessary for some background tasks (like retrying events triggered by cron), exposing this power to HTTP-triggered actions increases the risk of logic bugs leading to security bypasses.

**Remediation:**
- Minimize the use of the `admin` client.
- Prefer user-scoped clients (using the incoming `Authorization` header) for all user-initiated actions.
- Where `admin` client is required (e.g., accessing protected schemas), ensure strict authorization checks are performed *before* using it.

---

## Audit Log
- **Date:** October 2026
- **Auditor:** Jules (AI Security Engineer)
- **Scope:** RLS, Edge Functions, Finance Logic.

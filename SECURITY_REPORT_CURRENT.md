# Security Audit Report - Simplifica CRM
**Date:** May 2028 (Simulated Current)
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A recurring synchronization issue has caused the repository to revert to a Jan 2026 state, effectively undoing 2+ years of critical security patches. This regression has re-exposed known vulnerabilities including IDOR in Edge Functions, unauthenticated access to AWS management, and missing RLS policies on financial data tables.

## Critical Findings (Immediate Remediation Required)

### 1. IDOR & Information Disclosure in `verifactu-dispatcher` (CRITICAL)
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Issue:** The function contains "debug" endpoints (`debug-test-update`, `debug-env`, `debug-aeat-process`) that were previously removed but have reappeared.
- **Impact:**
  - Allows unauthenticated attackers to view sensitive configuration (certificates, environment variables).
  - Allows modification of event status (`events` table) for ANY company by guessing `company_id`.
  - Bypasses all RLS and AuthGuards.

### 2. Unauthenticated AWS Resource Management (CRITICAL)
- **File:** `supabase/functions/aws-manager/index.ts`
- **Issue:** The function processes `register-domain` and `check-availability` actions without validating the user's identity or company association.
- **Impact:**
  - An attacker can register domains at the organization's expense.
  - Exposure of internal AWS logic.
- **Root Cause:** The function uses `Deno.env.get` for AWS keys but fails to instantiate a Supabase client to verify the `Authorization` header.

### 3. Missing RLS on Financial Child Tables (HIGH)
- **Affected Tables:** `invoice_items`, `quote_items` (and likely `company_members` policy regressions).
- **Issue:** Due to the revert, migrations from 2027-2028 enforcing RLS on these tables are missing.
- **Impact:**
  - If a user has a valid token, they might be able to SELECT/INSERT items for invoices belonging to other companies if the parent-child relationship check is missing in RLS.

## Medium/Low Findings

### 4. Build Configuration Issues (MEDIUM)
- **Issue:** `package.json` is missing `@types/node-forge`, causing build failures in strict environments. Missing `lint` script.
- **Impact:** Hinders CI/CD pipeline integrity and static analysis.

### 5. Frontend Secrets (MEDIUM)
- **Observation:** `scripts/generate-runtime-config.mjs` generates config. Need to ensure it doesn't leak service keys. (Pending verification of script content).

## Proposed Remediation Plan
1.  **Patch `verifactu-dispatcher`:** Remove all `if (body.action === 'debug-...')` blocks.
2.  **Patch `aws-manager`:** Implement `createClient` with `Authorization` header and enforce `auth.getUser()`.
3.  **Restore Security Migrations:** Re-create the `secure_child_tables.sql` migration to enforce RLS on `invoice_items` and `quote_items` using the pattern `EXISTS (SELECT 1 FROM invoices WHERE id = invoice_items.invoice_id AND company_id = ...)`.

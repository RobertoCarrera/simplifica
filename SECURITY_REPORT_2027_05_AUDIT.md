# Security Audit Report - May 2027

**Status:** CRITICAL
**Auditor:** Jules (Senior Security Engineer)
**Date:** 2027-05-01

## Executive Summary
This audit has identified a **critical regression** in the system state. The codebase appears to have reverted to a state similar to January 2026, undoing months of security patches (Feb 2026 - Feb 2027). This regression has re-exposed critical vulnerabilities that were previously fixed, specifically IDOR in Edge Functions and missing/broken RLS policies.

## Key Findings

### 1. Critical Regression of Security Patches (CRITICAL)
- **Description:** Multiple migrations and code changes from 2026/2027 are missing. The latest migration in the repo is from Jan 29, 2026.
- **Impact:** Reintroduction of known vulnerabilities.
- **Affected Areas:** Entire system, specifically `verifactu-dispatcher` and RLS policies.

### 2. IDOR in `verifactu-dispatcher` (HIGH)
- **Description:** Debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`) accept a `company_id` parameter without verifying if the authenticated user belongs to that company.
- **Impact:** An attacker could read or modify sensitive VeriFactu events and AEAT processes for any company by guessing their `company_id`.
- **Files:** `supabase/functions/verifactu-dispatcher/index.ts`

### 3. Missing RLS on Child Tables (HIGH)
- **Description:** `invoice_items` and `quote_items` tables appear to lack active RLS policies or are relying on outdated configurations.
- **Impact:** Unrestricted access to line items if the parent table RLS is bypassed or if there are direct queries.
- **Files:** Database Schema (`invoice_items`, `quote_items`)

### 4. Broken RLS Logic in `company_members` (HIGH)
- **Description:** Existing/Old RLS policies on `company_members` compare `auth.uid()` directly to `user_id`. However, `user_id` refers to `public.users.id` (internal UUID), which is distinct from `auth.uid()` (Auth UUID).
- **Impact:** Policies will always fail (deny access) or behave unpredictably, effectively breaking multi-tenancy logic or locking users out.
- **Files:** `company_members` RLS policies.

## Recommended Actions (Immediate)
1.  **Patch `verifactu-dispatcher`:** Implement `requireCompanyAccess` to validate user membership before processing debug actions.
2.  **Fix RLS Policies:** Create a new migration to:
    - Correct `company_members` policies to bridge `auth.uid()` -> `public.users.id`.
    - Enable and secure RLS on `invoice_items` and `quote_items` via parent table joins.

# Security Audit Report - Simplifica

**Date:** November 2027
**Auditor:** Jules (Security Engineer)
**Scope:** RLS, Edge Functions, Financial Logic, Frontend Config.

## Executive Summary
A critical regression has been identified that has reverted the codebase to a state resembling January 2026. This has re-exposed previously patched vulnerabilities, most notably a severe IDOR in `verifactu-dispatcher` and widespread RLS failures due to missing policies and UUID mismatches. Additionally, `aws-manager` is completely unauthenticated.

## Critical Findings

### 1. Systemic RLS Regression & UUID Mismatch (CRITICAL)
*   **Description:** All 2027 migrations are missing. The `company_members` RLS policy uses `user_id = auth.uid()` directly. Since `public.users.id` and `auth.uid()` (Auth User ID) are distinct and not mapped, this likely breaks all legitimate access or, depending on the UUID generation, could allow incorrect access.
*   **Affected Tables:** `company_members` (gatekeeper for all access), `invoice_items`, `quote_items` (missing RLS entirely).
*   **Impact:**
    *   Legitimate users cannot access their company data (Denial of Service).
    *   Child tables (`invoice_items`, `quote_items`) are likely publicly readable/writable if RLS is not enabled, leaking financial line items.

### 2. IDOR in `verifactu-dispatcher` Debug Endpoints (CRITICAL)
*   **Description:** The Edge Function `verifactu-dispatcher` exposes debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) that accept a `company_id` in the body and execute admin-privileged operations without validating that the caller is a member of that company.
*   **File:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Impact:** An attacker can manipulate VeriFactu events, view certificate details, and trigger AEAT submissions for ANY company by guessing their UUID.

### 3. Unauthenticated Access in `aws-manager` (HIGH)
*   **Description:** The `aws-manager` function has no authentication checks.
*   **File:** `supabase/functions/aws-manager/index.ts`
*   **Impact:** Unauthenticated attackers can check domain availability and register domains (incurring costs) using the system's AWS credentials.

## Proposed Remediation (Immediate)

1.  **Deploy Critical RLS Patch:**
    *   Create a new migration to fix `company_members` RLS to correctly map `auth.uid()` to `public.users.id`.
    *   Enable RLS on `invoice_items` and `quote_items` and add policies ensuring access via parent `invoice_id`/`quote_id`.

2.  **Patch `verifactu-dispatcher`:**
    *   Implement `requireCompanyAccess` validation for all debug endpoints.

3.  **Patch `aws-manager` (Future/Next Sprint):**
    *   Add `supabase.auth.getUser()` check to ensure only authenticated admins can trigger domain operations.

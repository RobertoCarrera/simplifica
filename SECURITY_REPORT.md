# Security Audit Report - Simplifica CRM
**Date:** March 5, 2026
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A comprehensive security audit of the `Simplifica` CRM codebase identified **Critical** vulnerabilities in the Data Layer (RLS) and **High** risks in Edge Functions. Immediate remediation is required to prevent cross-tenant data leaks and unauthorized access.

## Findings

### 1. Data Layer (RLS) - CRITICAL

#### 1.1 Global Data Leak in `item_tags`
*   **Severity:** **CRITICAL**
*   **Location:** `item_tags` table (defined in `20260106110000_unified_tags_schema.sql`).
*   **Issue:** The RLS policies are set to `USING (true)` and `WITH CHECK (true)` for all authenticated users.
*   **Impact:** Any authenticated user (from any company) can view, create, update, and delete tags associated with ANY record (client, ticket, service) of ANY other company. This is a massive privacy breach.
*   **Recommendation:** Add `company_id` to `item_tags`, backfill it, and enforce strict RLS checking company membership.

#### 1.2 Cross-Tenant Access in `payment_integrations`
*   **Severity:** **CRITICAL**
*   **Location:** `payment_integrations` table (policies in `20260111130000_remove_legacy_role_column.sql`).
*   **Issue:** The RLS policy allows access if the user is an 'admin' or 'owner', but **fails to check if the user belongs to the same company** as the integration record.
*   **Impact:** An admin of Company A can view and potentially modify payment credentials (API keys) of Company B.
*   **Recommendation:** Update policies to strictly enforce `company_id` matching.

#### 1.3 Broken Access Control in `invoices` & `quotes`
*   **Severity:** **HIGH (Availability/Broken Access)**
*   **Location:** `invoices` and `quotes` tables (policies in `20260107022000_update_rls_invoices_quotes.sql`).
*   **Issue:** Policies compare `company_members.user_id` (internal UUID) directly with `auth.uid()` (Auth UUID). Since these IDs usually differ, the check fails.
*   **Impact:** Legitimate users (Owners/Admins) cannot view their own company's invoices or quotes.
*   **Recommendation:** Update policies to resolve the user ID correctly: `user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())`.

### 2. Edge Functions - HIGH

#### 2.1 IDOR in `verifactu-dispatcher` Debug Endpoints
*   **Severity:** **HIGH**
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`.
*   **Issue:** Endpoints `debug-test-update`, `debug-last-event`, `debug-aeat-process` accept a `company_id` in the body and use the Service Role key (`admin` client) to query/modify data. No check is performed to verify if the caller belongs to that company.
*   **Impact:** A malicious user can trigger debug actions, view last events, or corrupt event state for any company by guessing the `company_id`.
*   **Recommendation:** Implement `requireCompanyAccess(company_id)` using the user's Auth token and RLS.

#### 2.2 Unsecured `test-cert` Endpoint
*   **Severity:** **HIGH**
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`.
*   **Issue:** The `test-cert` action takes `company_id` and decrypts the company's private certificate to test it. It returns partial info and connection status. While it doesn't return the private key, it allows unauthorized usage of the certificate (signing test XML).
*   **Impact:** Unauthorized use of company resources; potential information disclosure.
*   **Recommendation:** Apply `requireCompanyAccess` to this endpoint.

## Proposed Remediation Plan
1.  **PR #1 (RLS Fixes):** Address findings 1.1, 1.2, and 1.3 via a new migration `20260305100000_fix_critical_rls_v3.sql`.
2.  **PR #2 (Edge Functions):** Address findings 2.1 and 2.2 by patching `verifactu-dispatcher`.

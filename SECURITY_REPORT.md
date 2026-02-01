# Security Audit Report - March 04, 2026

## Executive Summary
This audit has identified critical vulnerabilities in the Data Layer (RLS) and Edge Functions, along with a significant regression in the codebase state (reversion to Jan 29, 2026). Immediate action is required to secure tenant data.

## Critical Findings

### 1. RLS Cross-Tenant Data Leak (Payment Integrations)
*   **Severity**: **CRITICAL**
*   **Component**: PostgreSQL RLS Policies (`payment_integrations`)
*   **Description**: The current RLS policies for `payment_integrations` verify that the user is an admin/owner but fail to verify that the user belongs to the *same company* as the integration record.
*   **Impact**: Any authenticated admin from Company A can view, modify, or delete payment integration credentials (API keys) of Company B, Company C, etc.
*   **Remediation**: Update RLS policies to enforce `u.company_id = payment_integrations.company_id`.

### 2. Edge Function IDOR (VeriFactu Dispatcher)
*   **Severity**: **CRITICAL**
*   **Component**: Edge Function `verifactu-dispatcher`
*   **Description**: Debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`, `test-cert`) accept a `company_id` in the request body but perform no authorization check to ensure the caller belongs to that company.
*   **Impact**: Any user (authenticated or unauthenticated if they guess the URL/action) can trigger debug actions, view last events, and potentially expose sensitive environment configurations or AEAT certificate details for any company.
*   **Remediation**: Implement `requireCompanyAccess(company_id)` to validate the `Authorization` header against the requested `company_id`.

### 3. RLS Global Access (Item Tags)
*   **Severity**: **CRITICAL**
*   **Component**: PostgreSQL RLS Policies (`item_tags`)
*   **Description**: The `item_tags` table uses policies defined as `TO authenticated USING (true)` and `WITH CHECK (true)`. The table lacks a `company_id` column for scoping.
*   **Impact**: Any authenticated user can read, create, or delete tag assignments for any record (client, ticket, service) across the entire system.
*   **Remediation**: Add `company_id` column to `item_tags`, backfill data, and implement proper RLS policies. (Recommended for immediate follow-up).

## High Findings

### 4. Codebase Regression
*   **Severity**: **HIGH**
*   **Description**: The codebase appears to have reverted to a state from Jan 29, 2026, missing previously applied security fixes (Feb 28, Mar 03).
*   **Impact**: Re-introduction of known vulnerabilities and loss of work.
*   **Remediation**: Re-apply critical fixes immediately. Investigate synchronization mechanisms.

## Medium Findings

### 5. Missing Linting
*   **Severity**: **MEDIUM**
*   **Description**: `package.json` and `angular.json` lack linting configurations.
*   **Impact**: Reduced code quality and potential for future bugs.

---

## Action Plan
1.  **Fix `payment_integrations` RLS** (Included in this update).
2.  **Secure `verifactu-dispatcher` endpoints** (Included in this update).
3.  **Schedule `item_tags` remediation** (Follow-up task).

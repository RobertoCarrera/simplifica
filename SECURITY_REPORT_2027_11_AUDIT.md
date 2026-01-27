# Security Audit Report - November 2027

**Date:** November 2027
**Auditor:** Jules (Senior Security Engineer)
**Scope:** Recurring audit of Simplifica CRM (RLS, Edge Functions, Finance, Frontend)

## Executive Summary
A recurring audit has identified a critical regression in the security posture, likely due to environment synchronization issues reverting the state to Jan 2026. Critical vulnerabilities previously patched have re-emerged.

## Findings

### 1. [CRITICAL] Unauthenticated Access in `aws-manager`
*   **Component:** Edge Function `aws-manager`
*   **Description:** The function does not verify the caller's identity. It executes AWS Route53 and SES commands (e.g., `register-domain`) based solely on the input payload.
*   **Impact:** Unauthenticated attackers can register domains at the company's expense or modify DNS/Email settings, leading to financial loss and service disruption.
*   **Mitigation:** Implement `supabase.auth.getUser()` check at the start of the function.

### 2. [CRITICAL] Missing RLS on Financial Child Tables
*   **Component:** Database Tables `invoice_items`, `quote_items`
*   **Description:** Row Level Security (RLS) policies appear to be missing or disabled for child tables. While `invoices` and `quotes` are protected, the items within them might be accessible if the UUID is known or via permissive policies.
*   **Impact:** Potential data leakage of line items (prices, descriptions) across tenants.
*   **Mitigation:** Enable RLS and add policies that JOIN with parent tables (`invoices`, `quotes`) to verify `company_members` access.

### 3. [HIGH] IDOR in `verifactu-dispatcher` Debug Endpoints
*   **Component:** Edge Function `verifactu-dispatcher`
*   **Description:** Debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) accept a `company_id` in the body and perform actions using the Admin (Service Role) client without verifying if the caller belongs to that company.
*   **Impact:** A malicious user (or compromised account) can view or manipulate VeriFactu events and certificates of other companies (IDOR).
*   **Mitigation:** Implement `requireCompanyAccess` to validate the user's membership in the target company before proceeding.

## Action Plan
1.  **Immediate Fix:** Secure `invoice_items` and `quote_items` with strict RLS policies.
2.  **Immediate Fix:** Patch `verifactu-dispatcher` to enforce company membership checks on debug endpoints.
3.  **Next Steps:** Secure `aws-manager` and review all other Edge Functions for similar patterns.

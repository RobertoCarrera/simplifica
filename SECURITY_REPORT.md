# Security Audit Report - Simplifica CRM

**Date:** March 2026
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary

This audit focused on the Critical and High priority areas: RLS (Data Layer) and Edge Functions. We identified two Critical RLS vulnerabilities leading to cross-tenant data leaks and global data access, and two High severity issues in Edge Functions regarding webhook security and debug endpoint exposure.

## Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
- **Affected Resource:** `payment_integrations` table.
- **Vulnerability:** RLS policies allow any user with `admin/owner` role to view/edit payment integrations of *any* company. The policy checks the user's role but fails to check if the user belongs to the same company as the record.
- **Impact:** Critical. An attacker with a legitimate account in one company could steal Stripe/PayPal credentials of other companies.
- **Remediation:** Update RLS policies to enforce `u.company_id = payment_integrations.company_id`.

### 2. Global Write Access in `item_tags` (CRITICAL)
- **Affected Resource:** `item_tags` table.
- **Vulnerability:** RLS policies are set to `TO authenticated USING (true)`, allowing any authenticated user to read, insert, update, or delete tags for any record (clients, tickets, etc.) across the entire platform.
- **Impact:** Critical. Global data leakage and potential for data integrity attacks (tag spamming, deletion).
- **Remediation:** Add `company_id` column to `item_tags`, backfill data, and enforce RLS based on `company_id`.

### 3. Webhook Fail Open Vulnerability (HIGH)
- **Affected Resource:** `payment-webhook-stripe`, `payment-webhook-paypal`.
- **Vulnerability:** If the webhook signature header or the stored secret is missing, the functions skip verification and proceed to process the payment.
- **Impact:** High. An attacker could spoof payment events (e.g., mark invoices as paid) without a valid signature.
- **Remediation:** Implement strict "Fail Closed" logic. Reject requests if verification cannot be performed.

### 4. Exposed Debug Endpoints (HIGH)
- **Affected Resource:** `verifactu-dispatcher` Edge Function.
- **Vulnerability:** The function exposes `debug-test-update`, `debug-env`, and `debug-aeat-process` actions. These are either unauthenticated or rely on weak checks, allowing potential manipulation of internal state or information disclosure.
- **Impact:** High. Potential for DOS, data corruption, or leakage of environment details.
- **Remediation:** Remove debug code from production functions.

## Plan of Action

We will address these findings in the accompanying Pull Request:
1.  **Migration `20260327000000_fix_critical_rls_security.sql`**: Fixes findings #1 and #2.
2.  **Edge Function Updates**: Fixes findings #3 and #4.

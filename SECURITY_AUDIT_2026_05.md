# Security Audit Report - May 2026

## Executive Summary
This audit focused on Critical RLS policies and High-Risk Edge Functions. Four major vulnerabilities were identified, two of which are Critical data leaks.

## Findings

### 1. Payment Integrations Cross-Tenant Leak (CRITICAL)
- **Affected Resource:** `payment_integrations` table (RLS).
- **Description:** The current RLS policy checks if a user is an admin but fails to check if the record belongs to the user's company (`company_id`).
- **Impact:** Any admin of any company can view and potentially modify payment integrations (Stripe/PayPal keys) of ALL other companies.
- **Remediation:** Update RLS policy to enforce `company_id = user.company_id`.

### 2. Item Tags Global Access (CRITICAL)
- **Affected Resource:** `item_tags` table (RLS).
- **Description:** The table lacks a `company_id` column and the RLS policy is `USING (true)`, allowing global access to all authenticated users.
- **Impact:** Any user can view all tags for all records (clients, tickets) across the platform, revealing relationship metadata.
- **Remediation:** Add `company_id` column, backfill data from parent records, and restrict RLS to `company_id`.

### 3. Payment Webhook "Fail Open" (HIGH)
- **Affected Resource:** `payment-webhook-stripe` (Edge Function).
- **Description:** The function skips signature verification if the `stripe-signature` header is missing or if the secret is not configured.
- **Impact:** An attacker can spoof payment events (e.g., mark invoices as paid) by sending a request without a signature.
- **Remediation:** Enforce signature verification unconditionally.

### 4. Verifactu Dispatcher Debug Endpoints (HIGH)
- **Affected Resource:** `verifactu-dispatcher` (Edge Function).
- **Description:** The function exposes unauthenticated debug actions (`debug-test-update`, `debug-env`, etc.) that allow resetting events, viewing environment variables (potentially leaking partial secrets), and manipulating state.
- **Impact:** Potential for denial of service (resetting events) or information disclosure.
- **Remediation:** Remove all debug endpoints.

## Planned Actions
A single PR will be created to address all the above issues:
1.  **Migration:** Fix `payment_integrations` RLS and schema/RLS for `item_tags`.
2.  **Code Patch:** Fix `payment-webhook-stripe` logic.
3.  **Code Patch:** Remove debug code from `verifactu-dispatcher`.

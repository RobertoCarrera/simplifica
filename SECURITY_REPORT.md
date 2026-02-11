# Security Audit Report - 2026-02-xx

**Status:** IN PROGRESS
**Auditor:** Jules (Senior Security Engineer)
**Scope:** RLS, Edge Functions, Financial Logic, Frontend/Auth

## 1. Executive Summary

Three critical/high vulnerabilities were identified during the audit. The most severe involves a Row Level Security (RLS) bypass in the invoice PDF generation logic, potentially exposing hidden financial data. A second vulnerability involves a hardcoded fallback encryption key in payment integration tests. RLS policies for new modules (Bookings) were found to be generally sound but rely on manual toggling of public access which is currently restricted to authenticated users.

## 2. Findings

### [CRITICAL] Service Role Fallback in Invoice PDF Generation
*   **Location:** `supabase/functions/invoices-pdf/index.ts`
*   **Description:** The function attempts to fetch invoice items using the user's context (RLS). However, it includes a fallback logic: `if (!itErr && items && items.length <= 1) { ...fetch with admin... }`. This means if RLS intentionally hides items (e.g., restricted items, cost data, or specific line types), the system assumes it's an error and fetches *all* items using the `service_role_key`, completely bypassing the security model.
*   **Impact:** Disclosure of sensitive line items to unauthorized users (e.g., a client viewing an invoice might see internal notes or hidden costs if RLS was configured to hide them).
*   **Remediation:** Remove the Service Role fallback. The PDF generation must strictly respect what the user is allowed to see via RLS.

### [HIGH] Hardcoded Encryption Key Fallback
*   **Location:** `supabase/functions/payment-integrations-test/index.ts`
*   **Description:** The function defines `ENCRYPTION_KEY` with a fallback string: `Deno.env.get("ENCRYPTION_KEY") || "default-dev-key-change-in-prod"`. If the environment variable is missing (e.g., in a new deployment or misconfiguration), the system silently defaults to a known weak key.
*   **Impact:** If `payment_integrations` credentials are encrypted with this default key (or if the system accepts them), they are trivially decryptable if the codebase is known.
*   **Remediation:** Remove the fallback. Throw a critical error if `ENCRYPTION_KEY` is not defined.

### [MEDIUM] Bookings Public Access
*   **Location:** `supabase/migrations/20260110210000_create_booking_system.sql`
*   **Description:** `booking_types` table has RLS for company members but no policy for public access (e.g., for a public booking page). While this is "secure by default" (deny all), it suggests the public booking feature might be non-functional or relying on a future implementation that might be rushed.
*   **Remediation:** Verify if public booking is intended. If so, a specific `SECURITY DEFINER` function or a public RLS policy restricted by `is_active` and `company_id` is needed. For now, it is safe but functionally incomplete for public use.

## 3. Planned Actions

1.  **Fix Invoice PDF RLS Bypass:** Immediate removal of the admin client fallback in `invoices-pdf`.
2.  **Fix Encryption Key Fallback:** Modify `payment-integrations-test` to enforce strict environment variable presence.

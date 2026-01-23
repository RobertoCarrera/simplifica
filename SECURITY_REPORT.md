# Security Audit Report - Simplifica CRM
**Date:** March 15, 2026
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A comprehensive security audit of the Simplifica CRM codebase (Angular + Supabase) has identified **critical** vulnerabilities in the Data Layer (RLS) and Edge Functions. The most severe issues allow unauthenticated access to sensitive payment integration configurations and exposure of internal system diagnostics and event data. Additionally, financial logic relies on deprecated and insecure authorization patterns.

## Findings

### 1. CRITICAL: Unprotected Payment Integrations (RLS)
*   **Location:** `public.payment_integrations` table.
*   **Finding:** RLS policies are set to `TO public` for SELECT, INSERT, UPDATE, and DELETE.
*   **Impact:** Any user (including unauthenticated ones if the anon key allows public role access) can read and modify payment gateway API keys (Stripe, PayPal, etc.).
*   **Evidence:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`.
*   **Remediation:** Remove public policies and implement strict RLS checking `company_members` table.

### 2. CRITICAL: Information Leakage & Debug Endpoints in Edge Function
*   **Location:** `supabase/functions/verifactu-dispatcher/index.ts`.
*   **Finding:** The function exposes multiple unauthenticated debug endpoints (`diag`, `debug-env`, `debug-last-event`, `debug-aeat-process`, `debug-test-update`).
*   **Impact:** Attackers can retrieve environment variables (including configuration secrets), sample event data, and invoice metadata. They can also trigger test updates on event records.
*   **Evidence:** Code contains `if (body && body.action === 'diag')` blocks without prior `Authorization` header validation.
*   **Remediation:** Remove all debug endpoints immediately. Ensure all actions require a valid Supabase Auth user token.

### 3. HIGH: Insecure Financial Logic (Authorization & Integrity)
*   **Location:** `convert_quote_to_invoice` (Database Function).
*   **Finding:** The function authorizes users based on the deprecated `public.users.company_id` column.
*   **Impact:** Users with multiple company memberships or stale `company_id` values could generate invoices for companies they no longer have access to (IDOR). It also hardcodes currency to 'EUR'.
*   **Remediation:** Update function to validate against `public.company_members` for the specific company of the quote.

### 4. HIGH: Missing Security Migrations
*   **Location:** `supabase/migrations/`.
*   **Finding:** The repository lacks recent security migrations (Feb/March 2026) mentioned in internal logs, suggesting a sync regression.
*   **Impact:** The deployed environment might be more secure than the codebase, or vice-versa. Deploying current code might regress security fixes.
*   **Remediation:** Re-apply critical security fixes (products RLS, etc.) and ensure the codebase is the source of truth.

## Audit Plan
The following actions will be taken immediately:
1.  **Fix `payment_integrations` RLS**: Restrict access to company owners/admins.
2.  **Harden `verifactu-dispatcher`**: Remove debug code.
3.  **Secure `convert_quote_to_invoice`**: Fix authorization logic.

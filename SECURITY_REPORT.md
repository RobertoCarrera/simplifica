# Security Audit Report - Simplifica CRM
**Date:** April 23, 2026
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
A recurring security audit has identified three CRITICAL vulnerabilities resulting from a likely regression/file synchronization issue. Previous security patches (April 2026) are missing from the current codebase state, exposing the platform to unauthorized resource usage, critical information disclosure, and cross-tenant data access.

## Findings

### 1. `ai-request` Edge Function: Missing Authorization Validation (CRITICAL)
- **Description:** The function checks for the presence of an `Authorization` header but does not validate the token against Supabase Auth (`getUser()`).
- **Impact:** Any actor with the function URL can execute AI prompts using the platform's Google Gemini API key, leading to Resource Exhaustion and Financial Damage.
- **File:** `supabase/functions/ai-request/index.ts`
- **Remediation:** Implement `createClient` with the auth header and enforce `supabase.auth.getUser()`.

### 2. `verifactu-dispatcher` Information Disclosure & IDOR (CRITICAL)
- **Description:** Debug endpoints (`debug-env`, `debug-test-update`, `debug-aeat-process`) are present in the production code.
- **Impact:**
    - `debug-env` dumps all environment variables, including `SUPABASE_SERVICE_ROLE_KEY` and `VERIFACTU_CERT_ENC_KEY`.
    - `debug-test-update` allows arbitrary modification of event states.
    - `debug-last-event` allows inspecting other companies' events (IDOR) if the caller guesses a `company_id`.
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Remediation:** Remove all `debug-*` actions immediately.

### 3. Missing RLS Policies on Sensitive Tables (HIGH)
- **Description:** Migrations enabling RLS on `verifactu_settings`, `payment_integrations`, and `products` are missing from the `supabase/migrations` directory.
- **Impact:** Without explicit RLS, these tables may be accessible to any authenticated user (or public if policies are defaults), allowing cross-tenant data leakage (e.g., seeing another company's certificates or products).
- **Remediation:** Create a new migration to restore RLS policies using strict `company_members` checks.

## Recommended Actions
Immediate remediation is required. PRs will be created to:
1. Secure Edge Functions (Auth & Debug cleanup).
2. Restore Database RLS policies.

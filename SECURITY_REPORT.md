# Security Audit Report - April 2026

## Executive Summary
A recurrent security audit was performed on the "Simplifica" repository. Critical vulnerabilities involving Cross-Tenant Data Leakage and High-severity issues related to Edge Function authentication and secret management were identified.

## Findings

### 1. [CRITICAL] Cross-Tenant Access in `payment_integrations`
- **Severity:** CRITICAL
- **Component:** Database (RLS)
- **Description:** The RLS policy `payment_integrations_select` (and others) grants access to any user with an 'admin' or 'owner' role in `app_roles`, but fails to filter by `company_id`.
- **Impact:** An admin of Company A can view and manage payment integrations (including encrypted credentials) of Company B, C, etc.
- **Remediation:** Enforce `company_members` check in the RLS policy to ensure the user belongs to the same company as the integration.

### 2. [HIGH] Legacy Multi-Tenancy Logic in `payment-integrations-test`
- **Severity:** HIGH
- **Component:** Edge Function (`payment-integrations-test`)
- **Description:** The function relies on `public.users.company_id` and `public.users.role`. These columns are legacy/deprecated for multi-tenant users.
- **Impact:** Users belonging to multiple companies may be denied access or, worse, granted access to the wrong company context if the legacy column is stale.
- **Remediation:** Refactor to query `public.company_members` to validate the user's role within the specific `company_id`.

### 3. [HIGH] Hardcoded Secret Fallback
- **Severity:** HIGH
- **Component:** Edge Function (`payment-integrations-test`)
- **Description:** The function defaults `ENCRYPTION_KEY` to `"default-dev-key-change-in-prod"` if the environment variable is missing.
- **Impact:** If the environment variable is accidentally removed or not set in production, the system falls back to a known weak key, compromising all encrypted credentials.
- **Remediation:** Remove the fallback and throw a 500 error if the key is missing.

### 4. [HIGH] Insecure `verifactu_settings` RLS
- **Severity:** HIGH
- **Component:** Database (RLS)
- **Description:** Similar to `payment_integrations`, the RLS relies on `u.company_id = verifactu_settings.company_id`. While it filters by company, it uses the legacy `users.company_id` column.
- **Remediation:** Update RLS to use `company_members`.

### 5. [MEDIUM] Missing DOMPurify Config
- **Severity:** MEDIUM
- **Component:** Frontend
- **Description:** `dompurify.config.ts` is missing, potentially leaving the application with default (possibly insufficient for specific needs) or inconsistent sanitization settings.
- **Remediation:** Restore the configuration file.

## Action Plan
1. Apply migration `20260420000000_fix_payment_integrations_rls.sql` to fix RLS.
2. Patch `payment-integrations-test` Edge Function.

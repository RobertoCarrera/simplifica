# Security Audit Report - Simplifica CRM

**Date:** 2026-02-10
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
This audit focused on RLS policies, Edge Functions, and financial logic integrity. Critical vulnerabilities were found in Edge Functions regarding secret management and data access controls. RLS policies appear mostly robust, but a discrepancy regarding a recent fix suggests a need for reinforcement.

## Findings

### 1. Hardcoded Encryption Key in `payment-integrations-test` (CRITICAL)
- **File:** `supabase/functions/payment-integrations-test/index.ts`
- **Issue:** The function uses a hardcoded fallback key `default-dev-key-change-in-prod` if `ENCRYPTION_KEY` is not set.
- **Risk:** If the environment variable is missing in production, credentials (stored encrypted) could be decrypted by an attacker knowing this default key (which is now in git history).
- **Remediation:** Remove the fallback and throw an error if the key is missing.

### 2. RLS Bypass in `invoices-pdf` (HIGH)
- **File:** `supabase/functions/invoices-pdf/index.ts`
- **Issue:** The function attempts to fetch invoice items using the `admin` (service role) client if the user-scoped client returns few/no items.
- **Risk:** This defeats RLS. If a user has access to an invoice but is restricted from seeing its items (e.g., via a specific policy), this function leaks them.
- **Remediation:** Remove the fallback logic. Trust RLS.

### 3. Unauthenticated Data Leak in `verifactu-dispatcher` (HIGH)
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Issue:** The `diag` action exposes sample event and metadata (including invoice IDs) without any authentication check.
- **Risk:** IDOR and information disclosure. An attacker can enumerate invoice IDs or see status updates.
- **Remediation:** Remove the `diag` action or enforce strict authentication.

### 4. Potential RLS Gaps in Configuration Tables (MEDIUM)
- **Files:** `supabase/migrations/*`
- **Issue:** Memory indicates `payment_integrations` and `verifactu_settings` had insecure policies fixed in `20260205...`, but this migration is missing from the file list.
- **Risk:** Configuration tables might be readable/writable by `public` or authenticated users without company restrictions.
- **Remediation:** Create a new migration to enforce strict RLS on these tables.

## Planned Actions
1. Patch `payment-integrations-test` to enforce env vars.
2. Remove RLS bypass in `invoices-pdf`.
3. Secure `verifactu-dispatcher`.
4. Apply RLS hardening migration.

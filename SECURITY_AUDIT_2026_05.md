# Security Audit Report - May 2026

## Executive Summary
This audit focused on RLS policies, multi-tenancy isolation, and Edge Function security. Critical vulnerabilities were identified in RLS policies for `payment_integrations` and `domains` tables, which allow cross-tenant data access. Additionally, the `verifactu-dispatcher` edge function was found to expose sensitive debug endpoints and environment variables without authentication.

## Findings

### 1. CRITICAL: Cross-Tenant Data Leak in RLS Policies
**Affected Resources:** `payment_integrations`, `domains` tables.
**Risk:**
- An admin of *any* company can view, modify, or delete payment integrations and domains of *all* other companies.
- The policies check for 'admin' role but fail to verify that the admin belongs to the same company as the target resource.
**Recommendation:**
- Update RLS policies to strictly enforce `company_id` matching between the requesting user and the resource.

### 2. CRITICAL: Unauthenticated Debug Endpoints & Env Leak
**Affected Resources:** `verifactu-dispatcher` Edge Function.
**Risk:**
- The function exposes `debug-env`, `debug-aeat-process`, and `debug-test-update` actions.
- `debug-env` returns all environment variables, including `SUPABASE_SERVICE_ROLE_KEY` and other secrets.
- These endpoints have no authentication checks.
**Recommendation:**
- Remove all debug endpoints immediately.

### 3. HIGH: Hardcoded Default Encryption Key
**Affected Resources:** `payment-webhook-stripe` Edge Function.
**Risk:**
- The function uses a hardcoded default `ENCRYPTION_KEY` ("default-dev-key-change-in-prod") if the environment variable is missing.
- This weakens the security of encrypted data (like webhook secrets).
**Recommendation:**
- Remove the default fallback and throw an error if the key is missing.

## Planned Actions
1. **Fix RLS Leaks:** Apply migration `20260505000000_fix_critical_rls_leaks.sql` to patch `payment_integrations` and `domains`.
2. **Secure Edge Function:** Remove debug code from `verifactu-dispatcher`.

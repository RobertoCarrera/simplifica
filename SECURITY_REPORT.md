# Security Report - Simplifica CRM Audit
**Date:** March 9, 2026
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
Three critical/high severity issues were identified during the audit. The most severe involves a cross-tenant data leak in the `item_tags` and `payment_integrations` tables due to permissive Row Level Security (RLS) policies. Additionally, the `verifactu-dispatcher` edge function exposes insecure debug endpoints vulnerable to IDOR.

## Findings

### 1. [CRITICAL] Global Data Leak in `item_tags`
**Risk:** Data Leakage / Integrity Loss
**Affected Resource:** `public.item_tags` table
**Description:**
The RLS policies for `item_tags` are defined as `USING (true)` and `WITH CHECK (true)`. This allows **any authenticated user** (from any company) to:
- View all tags for all records (clients, tickets, etc.) of all other companies.
- Insert, update, or delete tags for any record in the system.
**Impact:** Malicious users can harvest metadata (tags) about clients/tickets of competitors or vandalize tag data.

### 2. [CRITICAL] Cross-Tenant Access in `payment_integrations`
**Risk:** Data Leakage (Sensitive Credentials)
**Affected Resource:** `public.payment_integrations` table
**Description:**
The RLS policies restrict access to users with 'admin'/'owner' roles but **fail to filter by `company_id`**.
Policy clause: `EXISTS (SELECT 1 FROM public.users ... WHERE u.auth_user_id = auth.uid() AND ar.name IN ('admin'...))`
**Impact:** An admin of Company A can view and potentially modify payment integration credentials (API keys, secrets) of Company B, C, etc.

### 3. [HIGH] IDOR and Information Disclosure in `verifactu-dispatcher`
**Risk:** IDOR / Privilege Escalation / Info Disclosure
**Affected Resource:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:**
Several debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) accept a `company_id` in the request body and perform actions using the `service_role` client without verifying if the caller belongs to that company.
**Impact:**
- **Privilege Escalation:** An attacker can trigger state changes (e.g., resetting invoice events) for other companies.
- **Info Disclosure:** `debug-env` exposes internal environment configuration.

## Recommendations
1.  **Immediate:** Update RLS policies for `payment_integrations` to enforce `company_id` checks.
2.  **Immediate:** Add `company_id` column to `item_tags`, backfill it, and enforce strict RLS.
3.  **Short-term:** Secure `verifactu-dispatcher` by validating user access to the requested `company_id`.

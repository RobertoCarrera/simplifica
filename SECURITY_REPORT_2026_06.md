# Security Audit Report - June 2026

**Auditor:** Jules (Senior Security Engineer)
**Date:** June 01, 2026
**Target:** Simplifica CRM (Supabase + Angular)

## Executive Summary
This audit focused on RLS implementation, Edge Function security, and multi-tenancy isolation. Three significant issues were identified, ranging from CRITICAL to HIGH priority. The most severe issue involves unauthenticated debug endpoints in the billing dispatcher that could allow IDOR attacks.

## Findings

### 1. Unauthenticated Debug Endpoints in `verifactu-dispatcher` (CRITICAL)
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function exposes several "debug" actions (`debug-test-update`, `debug-env`, `debug-aeat-process`) that accept a `company_id` in the request body. These blocks lack any authorization check (RLS or otherwise).
- **Impact:** An attacker can:
  - Retrieve environment configuration (including partial keys or mode settings).
  - Trigger arbitrary AEAT (Tax Authority) submissions for *any* company by guessing or knowing its UUID.
  - Reset or modify event states for any company.
- **Remediation:** Remove these debug endpoints entirely in production code.

### 2. Deprecated Authorization Logic in `upload-verifactu-cert` (HIGH)
- **File:** `supabase/functions/upload-verifactu-cert/index.ts`
- **Description:** The function authorizes users by querying `public.users.company_id` and `public.users.role`.
- **Context:** The system architecture has migrated to `public.company_members` for multi-tenancy. The `public.users.company_id` column is deprecated and may not reflect the user's actual active membership or role.
- **Impact:** Potential authorization bypass if a user is removed from `company_members` but the legacy column in `users` is not cleared, or if a user has access to multiple companies (logic fails to account for this).
- **Remediation:** Refactor to query `public.company_members` verifying `user_id`, `company_id`, and `role` IN ('owner', 'admin').

### 3. Deprecated Authorization Logic in `verifactu-dispatcher` (HIGH)
- **File:** `supabase/functions/verifactu-dispatcher/index.ts` (Action: `list-registry`)
- **Description:** Similar to finding #2, the `list-registry` action derives the user's company from `public.users.company_id`.
- **Impact:** Users may see registry data for the wrong company or retain access after removal.
- **Remediation:** Update logic to derive company context from `public.company_members`.

## Recommended Actions
1. **Immediate:** Remove debug code from `verifactu-dispatcher`.
2. **Immediate:** Patch `upload-verifactu-cert` to use `company_members`.
3. **Follow-up:** Audit all Edge Functions for `from('users')` usage and replace with `company_members` lookups.

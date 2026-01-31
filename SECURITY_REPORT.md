# Security Audit Report - Simplifica

**Date:** February 2026
**Auditor:** Jules (Security Engineer)

## Summary
This audit focused on Edge Functions and Multi-tenancy (RLS). Critical vulnerabilities were found in `aws-manager` (Unauthenticated Access) and `verifactu-dispatcher` (IDOR).

## Findings

### 1. [CRITICAL] Unauthenticated Access in `aws-manager`
- **File:** `supabase/functions/aws-manager/index.ts`
- **Description:** The function accepts `action` and `payload` from the request body without verifying the `Authorization` header or checking user roles.
- **Impact:** Any malicious actor with the URL can register domains (financial loss) or check availability.
- **Remediation:** Implement Supabase Auth validation and enforce `super_admin` or `owner` role check using `public.app_roles`.

### 2. [HIGH] IDOR in `verifactu-dispatcher` Debug Endpoints
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** Debug actions (`debug-test-update`, `debug-aeat-process`, etc.) and `test-cert` accept `company_id` in the body but use the `service_role` client to access data. There is no check that the caller belongs to the requested company.
- **Impact:** Privilege escalation/IDOR. A user from Company A can view debug info, reset events, or test certificates for Company B.
- **Remediation:** Implement a `requireCompanyAccess(company_id)` helper that validates the user's membership in the company via `public.company_members` (or `users` fallback).

### 3. [MEDIUM] Inconsistent Multi-tenancy Logic
- **File:** `supabase/migrations/20260129160000_finance_security_logic.sql` (RPC `convert_quote_to_invoice`)
- **Description:** The RPC `convert_quote_to_invoice` relies on `public.users.company_id` for ownership checks, while new RLS policies on `invoices` enforce checks against `public.company_members`.
- **Impact:** Potential denial of service for valid users if their `users.company_id` is stale, or potential bypass if `users.company_id` is manipulated (though RLS likely catches the write).
- **Remediation:** Align RPC logic to query `public.company_members`.

## Next Steps
Immediate fixes will be applied to `aws-manager` and `verifactu-dispatcher`.

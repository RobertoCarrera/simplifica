# Security Audit Report - Simplifica

**Date:** May 2026
**Auditor:** Jules (Senior Security Engineer)

## Summary
This audit focused on RLS implementation, multi-tenancy isolation, and Edge Function security. Several critical and high-severity issues were identified, primarily related to cross-tenant access and insecure debug endpoints.

## Findings

### 1. [CRITICAL] Insecure Debug Endpoints in `verifactu-dispatcher`
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The Edge Function exposes several "debug" actions (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`) that accept a `company_id` in the body and perform privileged operations (reading/updating events, dumping environment variables including encryption keys) without verifying if the caller belongs to that company.
- **Impact:** IDOR (Insecure Direct Object Reference) and Information Disclosure. An attacker could reset VeriFactu events, view logs, or obtain configuration secrets of any company.
- **Remediation:** Remove these debug endpoints immediately.

### 2. [CRITICAL] Cross-Tenant Access in `payment_integrations` RLS
- **File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (Policy Definitions)
- **Description:** The RLS policies for `payment_integrations` check if the user is an 'admin' or 'owner' but fail to verify that the user's company matches the `payment_integrations` record's `company_id`.
- **Impact:** Any admin of ANY company can view and modify payment integrations of ALL other companies.
- **Remediation:** Update policies to strictly enforce `company_members.company_id` matches `payment_integrations.company_id`.

### 3. [HIGH] Missing RLS on Child Tables (`invoice_items`, `quote_items`)
- **File:** Database Schema
- **Description:** `invoice_items` and `quote_items` tables appear to lack RLS policies in the migration history. If RLS is not enabled, or enabled with default "deny all" but no policies, they might be inaccessible to legitimate users or accessible to public (if RLS off). Given the pattern, they likely rely on implicit access or are exposed.
- **Impact:** Potential data leakage of line items if accessed directly.
- **Remediation:** Enable RLS and add policies that inherit permissions from their parent tables (`invoices`, `quotes`).

### 4. [MEDIUM] RLS Bypass in `invoices-pdf`
- **File:** `supabase/functions/invoices-pdf/index.ts`
- **Description:** The function has a fallback mechanism that fetches `invoice_items` using the `service_role` key if the user-scoped query returns few items.
- **Impact:** This bypasses RLS protections. While currently intended to fix "missing items", it masks underlying RLS configuration issues and could expose items a user shouldn't see.
- **Remediation:** Fix the underlying RLS issues (Finding #3) and eventually remove this fallback.

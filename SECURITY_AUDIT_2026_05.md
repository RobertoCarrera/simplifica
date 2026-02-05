# Security Audit Report - May 2026

**Date:** 2026-05-05
**Auditor:** Jules (Senior Security Engineer)
**Scope:** RLS Policies, Edge Functions

## Executive Summary
This audit identified critical vulnerabilities in the data layer (RLS) and edge functions that pose immediate risks of data leakage and unauthorized modification.

## Findings

### 1. Cross-Tenant Data Leak via RLS (CRITICAL)
**Affected Resources:** `payment_integrations`, `domains`, `scheduled_jobs`
**Description:**
The RLS policies for these tables allow any user with an 'admin' or 'owner' role to access **all** records in the table, regardless of which company they belong to. The policies fail to filter by `company_id`.
**Impact:**
A malicious admin from "Company A" can view and modify payment credentials, domains, and jobs of "Company B".
**Remediation:**
Update RLS policies to enforce `company_id` checks by joining `public.users`.

### 2. Unauthenticated Debug Backdoors in Edge Function (CRITICAL)
**Affected Resource:** `supabase/functions/verifactu-dispatcher`
**Description:**
The `verifactu-dispatcher` function contains hardcoded debug actions (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`, `diag`) that are accessible to any caller knowing the endpoint URL. These endpoints bypass authentication and allow arbitrary data modification and environment variable inspection (secrets leakage).
**Impact:**
- **Information Disclosure:** Leakage of configuration and potentially sensitive environment variables.
- **Integrity Violation:** Attackers can modify event statuses and trigger AEAT processes for any company.
**Remediation:**
Remove all debug code paths from the production function.

### 3. IDOR in VeriFactu Retry Action (HIGH)
**Affected Resource:** `supabase/functions/verifactu-dispatcher` (Action: `retry`)
**Description:**
The `retry` action accepts an `invoice_id` and resets the event status. It does not verify that the caller has access to the specified invoice.
**Impact:**
An attacker can force-retry failed events for other companies' invoices, potentially causing data inconsistency or improved brute-force conditions.
**Remediation:**
Implement `requireInvoiceAccess` check for the `retry` action.

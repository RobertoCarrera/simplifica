# Security Report - July 2026 (Recurring Audit)

## Executive Summary
During the recurring security audit of the Simplifica CRM platform, critical vulnerabilities were identified in the `verifactu-dispatcher` Edge Function and the Row Level Security (RLS) policies for financial data. These issues could allow unauthorized access to company data (IDOR) and exposure of sensitive financial records.

## Findings

### 1. Critical IDOR in `verifactu-dispatcher` (Edge Function)
- **Severity:** CRITICAL
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** Several debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`) were left active in the production code. These endpoints accept a `company_id` in the request body and perform actions using the `SUPABASE_SERVICE_ROLE_KEY` (admin privileges) without validating if the requester belongs to that company.
- **Impact:** An attacker could view event logs, VeriFactu status, and trigger AEAT submissions for *any* company by guessing or knowing their UUID. The `debug-env` endpoint also risked leaking environment configuration.
- **Remediation:** Remove all debug endpoints. Secure the `test-cert` endpoint with strict authorization checks.

### 2. Broken RLS Policies in `invoices` and `quotes`
- **Severity:** HIGH
- **Location:** Database RLS Policies (Migrations)
- **Description:** The RLS policies for `invoices` (SELECT/DELETE) and `quotes` (All operations) rely on comparing `auth.uid()` directly with `company_members.user_id`. However, the system architecture separates `auth.users.id` (Auth Service) from `public.users.id` (Application Data), meaning these IDs are different.
- **Impact:** Legitimate users (including Owners and Admins) are likely unable to view or delete their invoices/quotes via the standard API, leading to a Denial of Service or fallback to insecure `service_role` usage. In a worst-case scenario, if IDs accidentally collided, unauthorized access could occur.
- **Remediation:** Update policies to correctly map `auth.uid()` to `public.users.id` before checking membership.

### 3. Missing RLS on `invoice_items` and `quote_items`
- **Severity:** HIGH
- **Location:** Database Schema
- **Description:** The child tables `invoice_items` and `quote_items` do not have explicit RLS policies defined in recent migrations.
- **Impact:** If RLS is enabled but no policies exist, data is inaccessible (DoS). If RLS is *not* enabled, these tables are publicly readable/writable by any authenticated user, allowing data leakage or tampering of invoice details.
- **Remediation:** Enable RLS and add policies that inherit permissions from the parent `invoices`/`quotes` tables.

## Action Plan
1. **Immediate Fix (PR 1):** Remove insecure debug code from `verifactu-dispatcher` and implement `requireCompanyAccess`.
2. **Database Fix (PR 2):** Deploy a new migration to repair RLS policies for `invoices`, `quotes`, and their items.

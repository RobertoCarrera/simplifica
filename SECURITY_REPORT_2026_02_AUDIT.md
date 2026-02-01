# Security Report - Simplifica CRM

**Date:** February 2026
**Auditor:** Jules (AI Security Engineer)

## Summary
A recurring security audit was performed on the `Simplifica` repository. Several critical vulnerabilities were identified, primarily involving Cross-Tenant Data Leaks (RLS) and IDOR in Edge Functions due to improper authorization checks.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
- **Location:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (and active policies).
- **Description:** The RLS policies for `payment_integrations` allow any user with an 'admin' or 'owner' role to access **all** records in the table, regardless of the `company_id`. The policy checks if the user is an admin, but fails to check if the user belongs to the same company as the payment integration record.
- **Impact:** An admin from Company A can view and modify payment keys (Stripe, PayPal) of Company B.
- **Remediation:** Update policies to enforce `company_id` matching.

### 2. [CRITICAL] Cross-Tenant Data Leak in `item_tags`
- **Location:** `supabase/migrations/20260106110000_unified_tags_schema.sql`
- **Description:** The `item_tags` table has `TO authenticated USING (true)` policies for SELECT, INSERT, and DELETE. This table links tags to polymorphic records (clients, tickets).
- **Impact:** Any authenticated user can read all tags and associations for all companies. They can also delete or tag records of other companies.
- **Remediation:** Denormalize `company_id` into `item_tags` and enforce RLS based on company affiliation.

### 3. [HIGH] IDOR and Debug Endpoint Exposure in `verifactu-dispatcher`
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The Edge Function exposes several "debug" actions (`debug-test-update`, `debug-last-event`, `debug-aeat-process`) that accept a `company_id` in the body and perform operations using the `service_role` client without verifying if the caller belongs to that company.
- **Impact:** Any authenticated user (or anyone with the anon key if not properly gated, though the code checks for Authorization header) can trigger AEAT processes, view event logs, and potentially reset event states for any company by guessing the `company_id`.
- **Remediation:** Remove debug endpoints or strictly gate them behind `requireCompanyAccess` checks.

### 4. [HIGH] `payment_integrations` Table missing Definition
- **Location:** Migration history.
- **Description:** The `payment_integrations` table definition seems missing from the scanned migrations, but policies are applied to it. This suggests a potential gap in schema management or visibility.
- **Impact:** Hard to audit constraints and columns.

## Proposed Action Plan
1.  **Immediate Fix:** Apply a migration to secure `payment_integrations` and `item_tags`.
2.  **Immediate Fix:** Patch `verifactu-dispatcher` to remove or secure debug endpoints.

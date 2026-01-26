# Security Audit Report - October 2026

## Executive Summary
This audit focused on Critical and High priority risks in the RLS layer and Edge Functions. We identified significant IDOR vulnerabilities in debug endpoints and missing RLS protections on child tables.

## Findings

### 1. CRITICAL: IDOR in `verifactu-dispatcher` Debug Endpoints
- **Affected File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: The endpoints `debug-test-update`, `debug-last-event`, `debug-aeat-process`, and `test-cert` accept a `company_id` in the request body and perform administrative actions using the `SUPABASE_SERVICE_ROLE_KEY` (admin) client.
- **Risk**: Any user (authenticated or potentially unauthenticated if network access allows) can invoke these endpoints with any `company_id` to view sensitive event logs, test certificates, or modify event states, completely bypassing company isolation.
- **Remediation**: Implement strict authorization checks using a user-scoped Supabase client to verify that the caller is an active 'owner' or 'admin' of the target company before processing the request.

### 2. CRITICAL: Missing RLS on Child Tables (`invoice_items`, `quote_items`)
- **Affected Tables**: `public.invoice_items`, `public.quote_items`, `public.payment_transactions`
- **Description**: These tables likely lack Row Level Security (RLS) policies. While the parent tables (`invoices`, `quotes`) are secured, direct access to child tables via the API could allow users to list items belonging to other companies if they guess UUIDs or if policies default to permissive.
- **Risk**: Data leakage of line items and transaction details between tenants.
- **Remediation**: Enable RLS on these tables and add policies that enforce access via a JOIN to the parent table and `company_members` validation.

### 3. HIGH: `aws-manager` Unauthenticated Access
- **Affected File**: `supabase/functions/aws-manager/index.ts`
- **Description**: The function accepts `action` and `payload` without verifying the caller's identity against Supabase Auth.
- **Risk**: Unauthorized users could potentially trigger AWS resource actions (domain checks/registration) if they know the endpoint URL.
- **Remediation**: Implement `getUser()` validation and restrict access to authenticated users (and ideally specific roles).

### 4. HIGH: `payment-webhook-stripe` Security
- **Affected File**: `supabase/functions/payment-webhook-stripe/index.ts`
- **Description**: The function correctly verifies Stripe signatures when `webhook_secret_encrypted` is present. However, it relies on `payment_integrations` lookup which should be carefully monitored to ensure no cross-tenant interference.
- **Status**: Currently appears secure regarding signature verification, but the lookup logic relies on `company_id` from the invoice found via token. This is generally safe as long as the token is high-entropy.

## Plan of Action
1.  **Immediate Fix**: Patch `verifactu-dispatcher` to enforce `requireCompanyAccess` on all debug endpoints.
2.  **Immediate Fix**: Apply RLS policies to `invoice_items` and `quote_items`.

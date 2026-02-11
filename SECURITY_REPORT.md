# Security Audit Report - April 2026

## Executive Summary
This report outlines security findings from the recurring audit of the Simplifica CRM codebase. The audit focused on RLS implementation, Edge Function security, and multi-tenancy isolation.

## Findings

### 1. [CRITICAL] Authentication Bypass in `ai-request` Edge Function
*   **File:** `supabase/functions/ai-request/index.ts`
*   **Description:** The function manually checks for the presence of an `Authorization` header but **does not validate the token** against Supabase Auth. Any request with a header like `Authorization: Bearer fake-token` is accepted.
*   **Impact:** Unauthenticated attackers can consume paid Gemini API quota and potentially inject malicious prompts.
*   **Remediation:** Implement `supabase.auth.getUser()` to validate the JWT.

### 2. [HIGH] Missing RLS on `products` Table
*   **Component:** Database Schema / RLS
*   **Description:** The migration `20260325000000_secure_products.sql` is missing from the codebase. The `products` table, referenced in `client-create-ticket`, likely lacks Row Level Security policies.
*   **Impact:** Potential IDOR or Cross-Tenant data leakage. Users might be able to view or modify products from other companies.
*   **Remediation:** Create a new migration to `ALTER TABLE products ENABLE ROW LEVEL SECURITY` and add strict `company_id` based policies.

### 3. [HIGH] Missing RLS on `payment_integrations` Table
*   **Component:** Database Schema / RLS
*   **Description:** The migration `20260315000000_fix_payment_integrations_rls.sql` is missing. The `payment_integrations` table contains sensitive credentials (encrypted, but still sensitive) and must be isolated.
*   **Impact:** Cross-tenant access to payment configuration metadata.
*   **Remediation:** Re-implement RLS policies for `payment_integrations`.

### 4. [INFO] `booking-manager` Edge Function is a Stub
*   **File:** `supabase/functions/booking-manager/index.ts`
*   **Description:** The function contains stubbed methods (`checkAvailability`, `createBooking`) that return mock success responses.
*   **Impact:** Functionality is incomplete, but no immediate security risk as it performs no DB operations.
*   **Remediation:** Ensure it remains disabled or is properly implemented with Auth/RLS before go-live.

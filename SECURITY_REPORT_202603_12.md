# Security Audit Report - March 12, 2026

## Executive Summary
This report details the findings of the recurring security audit for the "Simplifica" CRM. The audit focused on RLS policies, Edge Functions, and Financial Logic.

**Critical Vulnerability Identified:** The `verifactu-dispatcher` Edge Function exposes debug endpoints that allow unauthenticated users to dump environment variables (including `SUPABASE_SERVICE_ROLE_KEY`) and execute arbitrary update commands.

## Findings

### 1. CRITICAL: Remote Environment Variable Leak (`verifactu-dispatcher`)
- **Severity:** CRITICAL
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function contains "debug" blocks (lines 511-744) that are accessible via simple POST requests without proper authentication. Specifically, the `debug-env` action returns `Deno.env`, exposing the `SUPABASE_SERVICE_ROLE_KEY`. The `debug-test-update` action allows arbitrary database updates to the `events` table.
- **Impact:** Full compromise of the database via exposed Service Role key.
- **Remediation:** Remove the debug code blocks immediately.

### 2. HIGH: Missing Storage RLS Policies
- **Severity:** HIGH
- **Location:** `supabase/migrations` (Storage)
- **Description:** No migrations were found defining Row Level Security (RLS) policies for `storage.objects` or `storage.buckets`. While code like `invoices-pdf` uses Signed URLs (implying private buckets), the lack of explicit RLS means that if a bucket is accidentally made public, or if a user guesses a path, data could be leaked. Additionally, `invoices-pdf` uses the Service Role to upload files, bypassing any potential RLS checks.
- **Remediation:** Add a migration to enable RLS on `storage.objects` and define strict policies based on `bucket_id` and `company_id` (via folder structure).

### 3. HIGH: Deprecated Column Usage in Financial Logic
- **Severity:** HIGH
- **Location:** `convert_quote_to_invoice` (Database Function)
- **Description:** The function relies on `public.users.company_id` to determine the user's company. This column is deprecated in favor of `public.company_members`.
- **Risk:** Potential for ambiguity or privilege escalation if a user is a member of multiple companies but the `users.company_id` field is stale or manipulated.
- **Remediation:** Refactor the function to query `public.company_members`.

### 4. MEDIUM: Service Role Bypass in PDF Generation
- **Severity:** MEDIUM
- **Location:** `supabase/functions/invoices-pdf/index.ts`
- **Description:** The function uses `SUPABASE_SERVICE_ROLE_KEY` to fetch invoice items and upload PDFs. While it does perform an initial RLS check using the user token, it falls back to the admin client for certain operations.
- **Remediation:** Ensure all data fetching utilizes the user-scoped client. Configure Storage RLS so that the user can upload/read their own company's files, removing the need for the admin client.

## Recommendations
1.  **Immediate Action:** Deploy the fix for `verifactu-dispatcher` (included in this audit).
2.  **Next Steps:**
    - Create a migration to secure Storage Buckets.
    - Refactor `convert_quote_to_invoice`.
    - Audit the `bookings` logic to ensure `checkAvailability` (currently a stub) is implemented securely.

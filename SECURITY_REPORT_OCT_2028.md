# Security Report - October 2028

## Executive Summary
This report details the findings of the recurring security audit for the "Simplifica" CRM platform. The audit focused on RLS policies, Edge Functions, and financial logic. Critical vulnerabilities were identified in the Edge Functions layer, specifically related to unauthenticated access and exposed debug endpoints.

## Findings

### 1. [CRITICAL] Unauthenticated RCE in `aws-manager`
*   **File:** `supabase/functions/aws-manager/index.ts`
*   **Description:** The function accepts `action` and `payload` from the request body and executes AWS SDK commands (Route53, SES) without verifying the caller's identity.
*   **Impact:** An attacker can register domains, check availability, or manipulate DNS/Email settings (depending on the scope of the AWS credentials) by simply sending a POST request to the function URL. This is effectively Remote Code Execution / Unauthorized Resource Management.
*   **Mitigation:** Implement Supabase Auth checks. Verify the `Authorization` header and use `supabase.auth.getUser()` to ensure the caller is a valid user (and potentially an admin).

### 2. [HIGH] Exposed Debug Endpoints in `verifactu-dispatcher`
*   **File:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Description:** The function contains several debug actions (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`, `diag`) that are accessible without strict authorization checks (some rely on `body.company_id` but do not validate that the caller belongs to that company or has admin rights for these specific actions).
*   **Impact:**
    *   **Information Disclosure:** `debug-env` returns environment variables, including configuration settings.
    *   **Data Manipulation:** `debug-test-update` allows modifying event attempts and error states, potentially bypassing retry logic or hiding failures. `debug-aeat-process` can reset event states.
*   **Mitigation:** Remove these debug endpoints entirely from the production codebase.

### 3. [MEDIUM] Missing `company_id` in `integrations` Table
*   **File:** `supabase/migrations/20260110210000_create_booking_system.sql`
*   **Description:** The `public.integrations` table relies solely on `user_id`.
*   **Impact:** In a strict multi-tenant environment, resources should generally be scoped to a `company_id` to ensure data ownership remains with the organization, not the individual employee. This complicates data handover and RLS policies for company-wide access to integrations.
*   **Mitigation:** Add `company_id` column and update RLS policies to enforce company boundaries.

## Remediation Plan
1.  **Immediate:** Secure `aws-manager` by adding authentication checks.
2.  **Immediate:** Remove debug endpoints from `verifactu-dispatcher`.
3.  **Backlog:** Refactor `integrations` schema to include `company_id`.

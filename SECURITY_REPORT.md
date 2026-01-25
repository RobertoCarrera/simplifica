# Security Audit Report - Simplifica CRM
Date: June 01, 2026
Auditor: Jules (Security Engineer)

## Summary
This report outlines the findings from a security audit of the Simplifica CRM codebase. The audit focused on RLS policies, Edge Functions, and overall architecture.

## Findings

### 1. Critical: Unsecured Debug Endpoints in `verifactu-dispatcher`
- **Location**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Risk**: The function exposes several debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`, `diag`) that can be triggered by any unauthenticated user who knows the function URL and the JSON body structure.
- **Impact**:
    - **RCE/Data Modification**: `debug-test-update` allows modifying event attempts and errors.
    - **IDOR**: `debug-last-event` and `debug-aeat-process` allow accessing data and triggering processes for arbitrary `company_id`s.
    - **Information Disclosure**: `debug-env` exposes configuration details.
- **Remediation**: Remove these endpoints immediately.

### 2. High: Missing Authentication in `ai-request`
- **Location**: `supabase/functions/ai-request/index.ts`
- **Risk**: The function checks for the presence of an `Authorization` header but does **not** validate the token against Supabase Auth.
- **Impact**: Any user (or attacker) can bypass authentication by providing a fake header, consuming the Google AI API quota and potentially performing Denial of Service (DoS) attacks.
- **Remediation**: Implement `supabase.auth.getUser()` to validate the JWT.

### 3. Medium: Legacy Company Check in `upload-verifactu-cert`
- **Location**: `supabase/functions/upload-verifactu-cert/index.ts`
- **Risk**: The function uses `public.users.company_id` to authorize the user. This column is deprecated in favor of `public.company_members` for multi-tenancy.
- **Impact**: Users might be authorized against the wrong company context if they belong to multiple companies, or denied access if the legacy column is not synced.
- **Remediation**: Update the logic to join with `public.company_members`.

### 4. Medium: RLS Bypass Fallback in `invoices-pdf`
- **Location**: `supabase/functions/invoices-pdf/index.ts`
- **Risk**: The function has a fallback mechanism that fetches `invoice_items` using the `service_role` key if the user-scoped query returns few items.
- **Impact**: This masks potential RLS misconfigurations and could theoretically expose data that should be hidden by RLS policies.
- **Remediation**: Investigate why RLS might fail and fix the root cause (RLS policies) rather than bypassing it in the Edge Function.

## Recommendations
1.  **Immediate**: Apply fixes for `verifactu-dispatcher` and `ai-request`.
2.  **Short-term**: Audit `invoice_items` RLS policies and remove the fallback in `invoices-pdf`. Refactor `upload-verifactu-cert` to use `company_members`.
3.  **Long-term**: Implement a linter (add `lint` script) to catch common issues and enforce coding standards.

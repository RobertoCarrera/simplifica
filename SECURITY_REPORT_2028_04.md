# Security Audit Report - April 2028

## Executive Summary
A recurring system regression has been identified, reverting the codebase to a state resembling January 2026. This has re-introduced critical vulnerabilities that were previously patched in March 2028. Immediate remediation is required to secure data access and external service integrations.

## Critical Findings

### 1. Missing RLS on Financial Child Tables (CRITICAL)
- **Affected Resources:** `public.invoice_items`, `public.quote_items`.
- **Issue:** Row Level Security (RLS) is likely disabled or missing policies due to the disappearance of migrations `20280130` through `20280327`.
- **Impact:** Any authenticated user can potentially read, modify, or delete line items of invoices and quotes belonging to other companies (Horizontal Privilege Escalation).
- **Remediation:** Apply a new migration to enable RLS and enforce strict tenancy checks via parent tables.

### 2. Insecure Debug Endpoints in `verifactu-dispatcher` (CRITICAL)
- **Affected Resource:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Issue:** The function exposes `debug-test-update`, `debug-env`, `debug-last-event`, and `debug-aeat-process` actions.
- **Impact:**
    - **IDOR:** `debug-test-update` allows modifying event attempts/status for *any* company_id provided in the payload.
    - **Information Disclosure:** `debug-env` exposes environment variables, potentially including keys.
    - **Logic Bypass:** Bypasses `requireInvoiceAccess` checks.
- **Remediation:** Remove all debug code blocks immediately.

### 3. Unauthenticated AWS Manager (CRITICAL)
- **Affected Resource:** `supabase/functions/aws-manager/index.ts`
- **Issue:** The function processes `register-domain` and `check-availability` actions without checking the `Authorization` header or validating the user's identity.
- **Impact:** Unauthenticated attackers can register domains at the organization's expense.
- **Remediation:** Implement `supabase.auth.getUser()` verification.

## Medium Findings

- **Frontend Build Issues:** Reports of `pnpm build` failing due to `@types/node-forge` issues.
- **Linting:** `package.json` lacks a `lint` script.

## Action Plan
1. **Immediate:** Restore RLS for `invoice_items` and `quote_items`.
2. **Immediate:** Remove debug endpoints from `verifactu-dispatcher`.
3. **Follow-up:** Secure `aws-manager` with proper authentication.

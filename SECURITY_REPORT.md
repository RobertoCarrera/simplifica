# Security Audit Report - January 2028

**Auditor:** Jules (Senior Security Engineer)
**Date:** January 30, 2028
**Scope:** RLS, Edge Functions, Financial Logic, Frontend/Auth.

## Summary
A critical system regression has been detected, reverting the codebase to a state resembling January 2026. This has re-exposed previously patched vulnerabilities.

## Critical Findings

### 1. RLS Regression on Financial Child Tables (CRITICAL)
- **Description:** Child tables `invoice_items` and `quote_items` do not have Row Level Security (RLS) enabled or enforced.
- **Impact:** Any authenticated user (or anonymous if policies allow) can potentially read/write all invoice lines and quote items for any company, bypassing tenant isolation.
- **Affected Files:** Database Schema (missing migrations post-Jan 2026).
- **Remediation:** Apply strict RLS policies linking child items to their parent `invoices`/`quotes` and validating `company_members` access.

### 2. Unauthenticated `aws-manager` Edge Function (CRITICAL)
- **Description:** The `aws-manager` function accepts POST requests with `domain` payloads and executes AWS Route53/SES commands without checking the `Authorization` header or validating the user's identity.
- **Impact:** Attackers can register domains or check availability at the company's expense and potentially hijack DNS.
- **Affected Files:** `supabase/functions/aws-manager/index.ts`
- **Remediation:** Implement `supabase.auth.getUser()` validation using the caller's Bearer token.

### 3. IDOR in `verifactu-dispatcher` Debug Endpoints (HIGH)
- **Description:** The `verifactu-dispatcher` function contains debug blocks (e.g., `debug-last-event`, `debug-aeat-process`) that accept a `company_id` in the body and return sensitive event logs using the `service_role` client.
- **Impact:** An authenticated user (or anyone if the function is public) can enumerate and view VeriFactu submission statuses and errors for any company.
- **Affected Files:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Remediation:** Restrict debug endpoints or implement `requireCompanyAccess` to validate that the caller belongs to the target `company_id`.

## Planned Fixes (This PR)
1. **RLS:** Restore RLS on `invoice_items` and `quote_items`.
2. **Edge Function:** Secure `aws-manager` with mandatory authentication.

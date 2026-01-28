# Security Audit Report - March 2028 (Recurring)

**Auditor:** Security Engineer (AI)
**Date:** March 05, 2028
**Scope:** Recurring audit of RLS, Edge Functions, and Financial Logic.

## Executive Summary
Critically dangerous regressions were identified in the `aws-manager` Edge Function (unauthenticated RCE) and `verifactu-dispatcher` (IDOR). Additionally, child tables `invoice_items` and `quote_items` lack Row Level Security (RLS), exposing sensitive financial details.

## Findings

### 1. `aws-manager` Unauthenticated Remote Code Execution (CRITICAL)
- **Affected File:** `supabase/functions/aws-manager/index.ts`
- **Issue:** The function processes `action` and `payload` directly from the request body without checking the `Authorization` header or validating the user's identity.
- **Impact:** Any attacker can register domains, check availability, or use other AWS services configured in the function (Route53, SES) by sending a simple JSON request. This could lead to financial loss (buying domains) and infrastructure takeover.
- **Recommendation:** Implement strict `Authorization` header validation using `supabase.auth.getUser()`.

### 2. Missing RLS on `invoice_items` and `quote_items` (CRITICAL)
- **Affected Tables:** `invoice_items`, `quote_items`
- **Issue:** These tables do not have RLS enabled or policies defined.
- **Impact:** While `invoices` and `quotes` are protected, the line items (which contain prices, product names, and quantities) might be accessible to any authenticated user (or public if policies are missing entirely and no `ENABLE RLS` was run).
- **Recommendation:** Enable RLS and add policies that check membership in the company of the parent invoice/quote.

### 3. `verifactu-dispatcher` IDOR in Debug Endpoints (CRITICAL)
- **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Issue:** Debug endpoints like `debug-test-update`, `debug-last-event`, `debug-aeat-process` accept a `company_id` in the body and perform actions or return data for that company without verifying if the caller belongs to it.
- **Impact:** An attacker can view sensitive AEAT/VeriFactu event logs and potentially manipulate event states for any company.
- **Recommendation:** Remove debug endpoints in production or enforce strict company membership checks.

### 4. `verifactu-dispatcher` Hardcoded Debug/Mock Mode (HIGH)
- **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Issue:** The function has logic for `VERIFACTU_MODE` which defaults to `live`, but the debug endpoints allow bypassing normal checks.
- **Impact:** Confusion between test and live data; potential for accidental data submission or leakage.

## Plan for Remediation
1. **Immediate Fix (PR 1):** Patch `aws-manager` to enforce authentication.
2. **Immediate Fix (PR 2):** Apply RLS to `invoice_items` and `quote_items` via migration.
3. **Future:** Patch `verifactu-dispatcher` IDOR (outside scope of this 1-2 finding limit).

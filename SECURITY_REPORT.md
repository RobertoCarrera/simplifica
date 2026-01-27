# Security Audit Report - Dec 2027

## Summary
This report summarizes the findings of the security audit performed on the Simplifica CRM codebase. Three critical/high severity issues were identified, primarily related to regressions in security controls for Edge Functions and RLS policies.

## Findings

### 1. IDOR in `verifactu-dispatcher` (CRITICAL)
**Location:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:** The Edge Function exposes debug and testing endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) that accept a `company_id` in the request body. These endpoints use the `service_role_key` (Admin Client) to perform operations on the specified company's data without verifying if the requesting user is a member of that company.
**Impact:** Any authenticated user (or potentially unauthenticated user if they can bypass the loose checks) can read sensitive VeriFactu event logs, modify event states, or test certificates for *any* company in the system by simply guessing or knowing the `company_id`.
**Mitigation:** Implement strict authorization checks (`requireCompanyAccess`) for all debug endpoints to ensure the caller is a valid member of the target company.

### 2. Unauthenticated Access in `aws-manager` (CRITICAL)
**Location:** `supabase/functions/aws-manager/index.ts`
**Description:** The `aws-manager` Edge Function is completely unauthenticated. It does not check for the presence of an `Authorization` header nor does it validate the user's identity or permissions.
**Impact:** An attacker could invoke this function to register domains (`register-domain` action) at the company's expense or check domain availability without authorization. This allows for resource exhaustion and financial damage.
**Mitigation:** Enforce authentication by validating the `Authorization` Bearer token using `supabase.auth.getUser()` before processing any actions.

### 3. Missing RLS on Child Tables (HIGH)
**Location:** `invoice_items`, `quote_items` tables
**Description:** While parent tables (`invoices`, `quotes`) have robust RLS policies linked to `company_members`, the child tables `invoice_items` and `quote_items` appear to lack specific RLS policies or are relying on default behavior which might be insecure or functionally broken (causing regressions where items disappear). Previous audits identified this as a recurring regression.
**Impact:** Data leakage of invoice line items (prices, product names) if RLS is too permissive, or data unavailability if RLS is default-deny without proper policies.
**Mitigation:** Apply RLS policies to `invoice_items` and `quote_items` that explicitly check access permissions via the parent table (`invoice_id` -> `invoices.company_id` -> `company_members`).

## Next Steps
PRs will be created to address these issues immediately, prioritizing the Edge Function vulnerabilities and the RLS regression.

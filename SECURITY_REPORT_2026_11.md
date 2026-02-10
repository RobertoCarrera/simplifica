# Security Audit Report - November 2026

## Executive Summary
This audit identified critical vulnerabilities stemming from a regression in the codebase (likely due to file synchronization issues reverting files to their January 2026 state). The most severe issues are **IDOR vulnerabilities in Edge Functions** and **broken RLS policies** due to UUID mismatches.

## Critical Findings

### 1. Broken RLS on `quotes` Table (UUID Mismatch)
- **Severity:** **CRITICAL**
- **Location:** Database (RLS Policies)
- **Description:** The RLS policies for `quotes` (defined in `20260107...sql`) compare `company_members.user_id` directly to `auth.uid()`.
    - `auth.uid()` is the UUID from `auth.users`.
    - `company_members.user_id` is the UUID from `public.users`.
    - These are *different* UUIDs.
- **Impact:** The policies will always evaluate to `false` (or unpredictable results), effectively **locking out legitimate users** or, if matched by coincidence, allowing incorrect access.
- **Remediation:** Update policies to map `auth.uid()` to `public.users.id` before checking membership.

### 2. Missing/Weak RLS on Child Tables (`invoice_items`, `quote_items`)
- **Severity:** **HIGH**
- **Location:** Database (RLS Policies)
- **Description:** While `invoices` was patched in `20260129...sql`, the child tables (`invoice_items`, `quote_items`) appear to rely on older or missing policies. If they lack RLS or rely on the same broken UUID logic, they are vulnerable.
- **Impact:** Attackers could potentially read or manipulate line items of other companies' invoices if they guess the IDs.
- **Remediation:** Implement strict RLS on child tables by joining with the parent table (`invoices`/`quotes`) and verifying `company_members` access.

### 3. IDOR in `verifactu-dispatcher` Debug Endpoints
- **Severity:** **CRITICAL**
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`) accept a `company_id` in the JSON body and use the `admin` (service_role) client to query data.
- **Impact:** Any authenticated user (or anyone with the Anon key, depending on function configuration) can read sensitive VeriFactu event logs, AEAT responses, and certificate status for **any company** by supplying a target `company_id`.
- **Remediation:** Implement `requireCompanyAccess` helper to validate that the requesting user belongs to the target `company_id` before processing the request.

## Other Findings

### 4. `booking-manager` Stub
- **Severity:** Low (Info)
- **Location:** `supabase/functions/booking-manager/index.ts`
- **Description:** The function is currently a stub. It correctly uses RLS-compliant client creation (`Authorization` header forwarding), which is good practice. No immediate action needed until logic is implemented.

## Plan of Action
1.  **PR 1 (Database):** Fix `quotes` RLS and secure `invoice_items`/`quote_items`.
2.  **PR 2 (Edge Functions):** Secure `verifactu-dispatcher` debug endpoints.

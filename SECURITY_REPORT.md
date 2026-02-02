# Security Audit Report - Simplifica CRM
Date: 2026-03-10
Auditor: Jules (Security Engineer)

## Summary
A security audit was performed on the Simplifica CRM codebase focusing on RLS policies, Edge Functions, and financial logic.
**Two Critical** and **One High** severity vulnerabilities were identified requiring immediate attention.

## Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
**Affected Resource:** `public.payment_integrations` table (RLS Policies)
**Description:**
The RLS policies for `payment_integrations` allow any user with an 'owner', 'admin', or 'super_admin' role to access **all** records in the table, regardless of which company they belong to. The policy checks the user's role but fails to check if the user belongs to the same `company_id` as the payment integration record.
**Impact:**
A malicious administrator of Company A can view, update, or delete payment credentials (API secrets, keys) of Company B, C, etc. This is a complete breakdown of multi-tenancy for this table.
**Remediation:**
Update RLS policies to strictly enforce `u.company_id = payment_integrations.company_id`.

### 2. Cross-Tenant Data Leak in `item_tags` (CRITICAL)
**Affected Resource:** `public.item_tags` table (RLS Policies)
**Description:**
The RLS policies for `item_tags` are set to `TO authenticated USING (true)`. This allows any logged-in user to read, insert, and delete tags for any record (client, ticket, service) belonging to any company.
**Impact:**
Data leakage of business metadata (tags, volume of records). Potential for data integrity attacks (deleting tags of competitors).
**Remediation:**
Add `company_id` to `item_tags`, backfill it from related records, and enforce strict RLS based on `company_id`.

### 3. Unauthorized RCE/IDOR in `verifactu-dispatcher` (HIGH)
**Affected Resource:** `supabase/functions/verifactu-dispatcher`
**Description:**
The Edge Function exposes debug endpoints (`debug-test-update`, `debug-env`, `diag`, etc.) that are accessible to anyone who can invoke the function. These endpoints use the `service_role_key` to perform actions like:
- `debug-env`: Dumps all environment variables (including encryption keys).
- `debug-test-update`: Allows arbitrary updates to `verifactu.events` for any `company_id` provided in the payload.
- `diag`: Dumps sample data from the database.
**Impact:**
Full environment compromise (secrets leakage) and ability to manipulate VeriFactu event status for any company, bypassing all security controls.
**Remediation:**
Remove all debug endpoints immediately.

## Next Steps
PRs will be created to address these issues in order of priority.
1. Fix RLS on `payment_integrations` and `item_tags`.
2. Secure `verifactu-dispatcher` function.

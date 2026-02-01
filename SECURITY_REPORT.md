# Security Audit Report - 2026-02-28

## 1. CRITICAL: Cross-Tenant Data Leak in `payment_integrations`
- **Severity:** Critical
- **Affected Component:** Database (RLS Policies)
- **Description:** The RLS policies for `payment_integrations` (created in `20260111130000_remove_legacy_role_column.sql`) correctly check if a user is an admin/owner, but **fail to filter by `company_id`**.
- **Impact:** Any user with an 'admin' or 'owner' role in *any* company can SELECT, INSERT, UPDATE, and DELETE payment integrations (containing sensitive API keys for Stripe/PayPal) of *all other companies* on the platform.
- **Remediation:** Update RLS policies to enforce `payment_integrations.company_id` matches the user's `company_id` via `company_members` table.

## 2. HIGH: IDOR in `verifactu-dispatcher` (Edge Function)
- **Severity:** High
- **Affected Component:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** several actions (`test-cert`, `debug-aeat-process`, `debug-last-event`) accept a `company_id` in the request body and use the `service_role_key` to fetch sensitive data (certificates, logs) without verifying if the authenticated user belongs to that company.
- **Impact:** An authenticated user can probe the VeriFactu configuration and status of any other company by guessing their `company_id`.
- **Remediation:** Implement a `requireCompanyAccess` helper that validates the user's membership in the target company before processing the request. Remove dangerous debug endpoints like `debug-test-update`.

## 3. HIGH: Cross-Tenant Data Leak in `item_tags`
- **Severity:** High
- **Affected Component:** Database (RLS Policies)
- **Description:** The `item_tags` table uses a polymorphic association (`record_id`, `record_type`) but lacks a `company_id` column. The current RLS policy is `USING (true)`, allowing global read access to all tags.
- **Impact:** Users can see tags from other companies.
- **Remediation:** Denormalize `company_id` onto `item_tags` and enforce RLS. (Note: This requires a schema migration and backfill, which is outside the scope of this immediate hotfix PR).

## 4. MEDIUM: `custom-access-token` Trust Model
- **Severity:** Medium
- **Affected Component:** `supabase/functions/custom-access-token/index.ts`
- **Description:** The function trusts the `user.id` in the payload without strict signature verification, relying on Supabase Auth Hook security context.
- **Impact:** Potential spoofing if exposed publically.
- **Remediation:** Ensure function is not public or implement signature verification.

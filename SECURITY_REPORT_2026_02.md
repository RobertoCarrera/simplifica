# Security Report - February 2026

## Executive Summary
This audit identified **2 CRITICAL** and **1 HIGH** priority issues. Immediate action is required to secure the `aws-manager` function (RCE/Financial Risk) and the `payment_integrations` table (Cross-Tenant Data Leak).

## Findings

### 1. [CRITICAL] `aws-manager` Edge Function is Unauthenticated
- **Risk:** **Remote Code Execution (RCE) / Financial Loss**
- **Description:** The `aws-manager` function accepts POST requests without validating the `Authorization` header or checking user roles.
- **Impact:** Any malicious actor with the function URL and Anon Key can:
    - Register domains (incurring costs).
    - Check domain availability.
    - Potentially exploit other exposed AWS actions.
- **File:** `supabase/functions/aws-manager/index.ts`
- **Mitigation:** Implement `supabase.auth.getUser()` validation and restrict access to `super_admin` or `owner` roles via `public.app_roles`.

### 2. [CRITICAL] `payment_integrations` Cross-Tenant Data Leak
- **Risk:** **Data Leak / Privilege Escalation**
- **Description:** The RLS policies for `public.payment_integrations` are defined `TO public` or use weak checks that only verify if a user is an "admin" of *any* company, not the specific company owning the data.
- **Impact:** An admin of Company A can view, modify, or delete payment integrations (API keys, secrets) of Company B.
- **File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (source of bad policies)
- **Mitigation:** Drop existing policies and implement strict RLS using `public.company_members` to enforce `company_id` correlation.

### 3. [HIGH] Missing RPC `verifactu_preflight_issue`
- **Risk:** **Denial of Service (Functional)**
- **Description:** The `issue-invoice` function calls a database RPC `verifactu_preflight_issue` which does not exist in the current schema migrations.
- **Impact:** Invoice issuance will fail 100% of the time, causing business disruption.
- **Mitigation:** Restore the missing RPC migration or reimplement the logic within the Edge Function (less ideal).

## Recommendations
1. **Immediate:** Apply the fix for `aws-manager` to prevent abuse.
2. **Immediate:** Apply the migration to fix `payment_integrations` RLS.
3. **Short-term:** Investigate the missing `verifactu_preflight_issue` definition and restore it.

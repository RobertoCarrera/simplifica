# Security Audit Report - March 2026

## Executive Summary
This audit focused on RLS policies and Edge Functions. Two critical vulnerabilities were identified that allow cross-tenant data access and unauthorized execution of sensitive operations.

## Findings

### 1. CRITICAL: Cross-Tenant Data Leak in `payment_integrations` (RLS)
- **Severity:** CRITICAL
- **Component:** Database / RLS
- **File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
- **Description:** The RLS policies for the `payment_integrations` table allow any user with an 'admin', 'owner', or 'super_admin' role to view, insert, update, or delete *any* record in the table. The policies check for the role but fail to filter by `company_id`.
- **Impact:** An administrator of one company can retrieve the Stripe and PayPal credentials (encrypted, but potentially decryptable if they have access to the key or through other means) of all other companies.
- **Remediation:** Update RLS policies to strictly enforce `payment_integrations.company_id = users.company_id`.

### 2. HIGH: Unprotected Debug Endpoints in `verifactu-dispatcher` (IDOR)
- **Severity:** HIGH
- **Component:** Edge Functions
- **File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function exposes several debug endpoints (`debug-test-update`, `debug-aeat-process`, `test-cert`, `diag`) that accept a `company_id` payload. The function uses the `SUPABASE_SERVICE_ROLE_KEY` to execute these actions but does not verify that the caller is a member of the target company.
- **Impact:** Any authenticated user (or potentially unauthenticated depending on gateway config) can:
    - Trigger AEAT submissions for other companies.
    - View certificate details and environment configuration of other companies.
    - Reset event statuses for other companies.
- **Remediation:** Implement a `requireCompanyAdmin` check that validates the `Authorization` header and ensures the user belongs to the target `company_id` with appropriate privileges. Remove unnecessary debug endpoints like `diag`.

### 3. MEDIUM: Potential RLS Misconfiguration in `verifactu_settings`
- **Severity:** MEDIUM
- **Component:** Database / RLS
- **Description:** While `verifactu_settings` policies in the reviewed migration appeared to have `company_id` checks, they should be re-verified to ensure consistency with the `payment_integrations` fix.

## Recommendations
1. Apply the proposed RLS migration immediately.
2. Deploy the patched `verifactu-dispatcher` function.
3. Rotate all `payment_integrations` credentials as a precaution (out of scope for this automated fix).

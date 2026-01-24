# Security Audit Report - Simplifica CRM
Date: April 2026

## 1. Findings Summary

| Severity | Component | Description |
| :--- | :--- | :--- |
| **CRITICAL** | RLS / Database | `payment_integrations` table allows cross-tenant access. |
| **HIGH** | Edge Functions | `payment-integrations-test` uses hardcoded secrets fallback and deprecated schema. |
| **MEDIUM** | Edge Functions | `booking-manager` is a non-functional stub. |
| **MEDIUM** | RLS / Database | `public.booking_types` pending public access verification. |

## 2. Detailed Findings

### [CRITICAL] Cross-Tenant Access in `payment_integrations`
**Affected Resource:** Table `public.payment_integrations`
**Migration:** `20260111130000_remove_legacy_role_column.sql`
**Description:**
The RLS policies for `payment_integrations` check if a user is an 'admin' or 'owner' generally (via `app_roles`), but **fail to check if the user belongs to the specific company** owning the integration record.
```sql
-- Vulnerable Policy
CREATE POLICY "payment_integrations_select" ...
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ...
    WHERE u.auth_user_id = auth.uid() AND ar.name IN ('owner', 'admin'...)
  )
);
```
**Impact:** Any admin of *any* company can view, modify, or delete payment integrations (including encrypted credentials) of *all* other companies.
**Remediation:** Enforce `company_id` matching in RLS policies.

### [HIGH] Insecure Secrets & Deprecated Schema in `payment-integrations-test`
**Affected Resource:** Edge Function `payment-integrations-test`
**Description:**
1.  **Hardcoded Secret Fallback:** The function falls back to `"default-dev-key-change-in-prod"` if `ENCRYPTION_KEY` is missing. This allows potential decryption if the environment variable is accidentally omitted in production.
2.  **Deprecated Schema Usage:** The function queries `public.users.role`, a column marked for removal/deprecation, and fails to validate against `company_members`.
**Remediation:** Remove fallback and switch authorization to `company_members` table.

### [MEDIUM] Stubbed Functionality
**Affected Resource:** Edge Function `booking-manager`
**Description:** The function is implemented as a stub returning success without performing actions. While not a direct exploit, it represents logic gaps.

### [MEDIUM] Unverified Public Access
**Affected Resource:** Table `booking_types`
**Description:** Comments indicate "Public can view active booking types... Need to handle verify later". Current policies only allow authenticated company members. Public booking pages may be non-functional or require an open policy that needs careful scoping.

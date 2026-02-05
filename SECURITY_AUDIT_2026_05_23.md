# Security Audit Report - 2026-05-23

**Auditor:** Jules (Senior Security Engineer)
**Target:** Simplifica CRM (Supabase + Angular)

## Summary
This audit focused on RLS policies, Edge Functions, and Financial logic. Two CRITICAL findings were identified in the data layer (RLS) allowing potential cross-tenant data leaks. Two HIGH findings were identified in the payment webhooks allowing potential payment spoofing.

## Findings

### 1. Cross-Tenant Data Leak in RLS (CRITICAL)
- **Description:** Several RLS policies check if a user is an 'admin' or 'owner' but fail to verify that the resource belongs to the *same* company as the user. This effectively grants any admin of any company access to all records in these tables.
- **Affected Tables:** `payment_integrations`, `domains`, `scheduled_jobs`.
- **Vulnerability:**
  ```sql
  -- CURRENT INSECURE POLICY (Example)
  USING (
    EXISTS (
      SELECT 1 FROM public.users u ...
      WHERE u.auth_user_id = auth.uid() AND ar.name IN ('admin')
      -- MISSING: AND u.company_id = resource.company_id
    )
  )
  ```
- **Impact:** An attacker with a legitimate 'admin' account in their own tenant could list and modify payment credentials and domains of other companies.
- **Remediation:** Rewrite policies to strictly enforce `company_id` matching between the requesting user and the target resource.

### 2. 'Fail Open' Webhook Verification (HIGH)
- **Description:** The Stripe and PayPal webhook handlers (`payment-webhook-stripe`, `payment-webhook-paypal`) skip signature verification if the encryption keys or secrets are missing in the database configuration.
- **Affected Files:**
  - `supabase/functions/payment-webhook-stripe/index.ts`
  - `supabase/functions/payment-webhook-paypal/index.ts`
- **Code Snippet:**
  ```typescript
  if (integration?.webhook_secret_encrypted) {
      // verify...
  }
  // If missing, it falls through and processes the payment!
  ```
- **Impact:** An attacker could send forged webhooks (e.g., `payment_intent.succeeded`) to mark invoices as paid without actually paying, provided they can guess or obtain a valid invoice ID/token.
- **Remediation:** Implement 'Fail Closed' logic. If verification cannot be performed (due to missing config or invalid signature), the request must be rejected.

### 3. Inconsistent User ID Mapping (MEDIUM)
- **Description:** Some RLS policies map `auth.uid()` to `public.users.id` while others map to `public.users.auth_user_id`.
- **Impact:** Potential for broken access control if IDs do not align, though `auth_user_id` appears to be the correct mapping for Auth UUIDs.
- **Remediation:** Standardize on `auth_user_id` for all `auth.uid()` comparisons.

## Next Steps
- Apply migration `20260523000000_fix_critical_rls_leaks.sql`.
- Patch Edge Functions to enforce strict signature verification.

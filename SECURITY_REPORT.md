# Security Audit Report - March 21, 2026

## Summary
This audit identified **3 Critical/High** vulnerabilities affecting data isolation and financial integrity.

| Severity | Category | Issue | Impact |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | RLS / Data | Cross-Tenant Leak in `payment_integrations` | Admins of one company can view/edit payment secrets of ANY other company. |
| **HIGH** | Edge Functions | Fail Open in Payment Webhooks | Attackers can forge payment notifications (Stripe/PayPal) to mark invoices as paid without paying. |
| **HIGH** | Edge Functions | IDOR / Privilege Escalation in `verifactu-dispatcher` | Unauthenticated/Unauthorized access to debug endpoints allows modifying VeriFactu event history. |

---

## Detailed Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
**Affected File:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`
**Description:**
The RLS policies for `payment_integrations` check if the user is an 'admin' or 'owner' but **fail to check if the user belongs to the same company** as the integration record.
```sql
-- VULNERABLE POLICY
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u ...
    WHERE u.auth_user_id = auth.uid() AND ar.name IN ('owner', 'admin', ...)
    -- MISSING: AND u.company_id = payment_integrations.company_id
  )
);
```
**Risk:** An attacker with a valid admin account in *any* company can query `payment_integrations` for *all* companies, extracting encrypted Stripe/PayPal secrets.

### 2. Fail Open in Payment Webhooks (HIGH)
**Affected Files:**
- `supabase/functions/payment-webhook-stripe/index.ts`
- `supabase/functions/payment-webhook-paypal/index.ts`

**Description:**
Both functions verify signatures **only if** the integration configuration is found. If the integration lookup fails (or returns no secrets), the code **skips verification** and proceeds to process the payment event.
```typescript
// VULNERABLE LOGIC
if (integration?.webhook_secret_encrypted && stripeSignature) {
  // verify...
}
// If skipped, it proceeds to mark invoice as PAID!
```
**Risk:** An attacker can send a forged webhook payload (without a signature or with a target company that has the integration disabled/misconfigured) and successfully mark unpaid invoices as "paid".

### 3. IDOR / Debug Endpoints in `verifactu-dispatcher` (HIGH)
**Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:**
The function exposes debug actions (`debug-test-update`, `debug-env`) that execute with the **Service Role** (admin) client. These blocks are accessible to any caller and do not validate if the user is authorized for the target `company_id`.
```typescript
// VULNERABLE LOGIC
if (body && body.action === 'debug-test-update' && body.company_id) {
    // Updates database using admin client without auth check
}
```
**Risk:** An attacker can corrupt VeriFactu event history, trigger false submissions, or reset attempts for any company.

---

## Proposed Remediation (Immediate)

1.  **Fix RLS:** Apply a migration to enforce `u.company_id = payment_integrations.company_id` in all policies.
2.  **Fix Webhooks:** Implement "Fail Closed" logic. If integration or signature is missing, return `401 Unauthorized` or `400 Bad Request` immediately.
3.  **Secure Dispatcher:** Remove debug endpoints or wrap them in strictly authenticated blocks (e.g. `requireCompanyAccess`). (Prioritized for next sprint, focusing on 1 & 2 now).

# Security Audit Report - June 2027

**Status:** FAIL
**Regression Detected:** Yes (Environment matches Jan 2026 state)

## Executive Summary
An audit of the `Simplifica` CRM repository has identified a Critical regression where the codebase reflects a state from roughly Jan 2026. This regression has reintroduced previously fixed vulnerabilities, specifically regarding Row Level Security (RLS) policies and Edge Function access controls.

## Findings

### 1. RLS Policy UUID Mismatch (CRITICAL)
**Affected Tables:** `public.invoices`, `public.quotes`
**Description:**
Current RLS policies attempt to match `public.company_members.user_id` directly against `auth.uid()`.
```sql
-- INCORRECT
... WHERE cm.user_id = auth.uid() ...
```
Because `public.users.id` (referenced by `cm.user_id`) is distinct from `auth.users.id` (returned by `auth.uid()`), these policies will fail to match valid users, or potentially match incorrect ones if UUID collisions occur (unlikely but architecturally unsound).
**Risk:** Denial of Service (valid users cannot see data) or Broken Access Control.
**Remediation:** Policies must use a subquery to map the Auth UUID to the User ID:
```sql
... WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) ...
```

### 2. Missing RLS on Child Tables (CRITICAL)
**Affected Tables:** `public.invoice_items`, `public.quote_items`
**Description:**
These tables store sensitive line-item data (prices, products) but lack explicit RLS policies in the active migration history. If RLS is enabled, access is blocked (default deny). If RLS is disabled, data is publicly accessible. Given the regression, we must assume they are insecure.
**Risk:** IDOR. A malicious user could iterate through item IDs to read financial details of other companies.
**Remediation:** Enable RLS and add policies that check the parent table:
```sql
CREATE POLICY "inherit_invoice_permissions" ON public.invoice_items
USING ( EXISTS ( SELECT 1 FROM public.invoices i WHERE i.id = invoice_id ) );
```
(Note: The parent `invoices` table will filter based on the user's company access).

### 3. IDOR in Verifactu Dispatcher (HIGH)
**Affected Component:** `supabase/functions/verifactu-dispatcher`
**Description:**
Debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) accept a `company_id` parameter in the JSON body and use it to query data using a `service_role` client (`admin`). There is no check to ensure the authenticated user belongs to the requested `company_id`.
**Risk:** Data Leakage. An authenticated user can dump certificate details, AEAT event logs, and status for any company by guessing the `company_id`.
**Remediation:** Implement a `requireCompanyAccess(company_id)` helper that verifies the user's membership via `public.company_members`.

### 4. Stripe Webhook (Pass)
**Component:** `payment-webhook-stripe`
**Status:** Secure.
The function correctly implements `verifyStripeWebhook` to validate signatures and uses decryption for the webhook secret.

### 5. Invoice Issuance (Pass)
**Component:** `issue-invoice`
**Status:** Secure.
The function uses `createClient` with the user's Authorization header, relying on RLS (once RLS is fixed) to protect access.

## Next Steps
1. Apply database migration to fix RLS policies and secure child tables.
2. Patch `verifactu-dispatcher` to enforce access control on debug endpoints.

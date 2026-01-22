# Security Audit Report - March 2026

## Executive Summary
This audit focused on RLS policies, Edge Functions, and financial logic integrity. Two critical/high severity issues were identified requiring immediate remediation.

## Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
- **Component:** Database RLS (Row Level Security)
- **Affected Table:** `public.payment_integrations`
- **Description:** The current RLS policies allow any user with an 'admin', 'owner', or 'super_admin' role (in *any* company) to access `payment_integrations` records for **all** companies. The policies verify the user has a privileged role but do not enforce that the user belongs to the same company as the integration record. Additionally, policies are set `TO public` instead of `TO authenticated`.
- **Risk:** An admin of Company A can read (and potentially modify/delete) the PayPal/Stripe credentials of Company B.
- **Remediation:** Update RLS policies to strictly enforce `company_id` matching between the user and the resource.

### 2. Unauthenticated Debug Endpoints in `verifactu-dispatcher` (HIGH)
- **Component:** Edge Functions
- **Affected File:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The function exposes several debug actions (`debug-env`, `debug-test-update`, `debug-last-event`, `diag`) that execute without verifying the caller's authentication or authorization. These blocks rely solely on the `body.action` parameter.
- **Risk:**
    - **Information Disclosure:** `debug-env` exposes environment configuration (though keys might be masked, it reveals architecture).
    - **Integrity:** `debug-test-update` allows modifying event attempt counts, potentially disrupting the retry logic.
- **Remediation:** Remove these debug endpoints entirely from the production code.

### 3. Service Role Usage in `issue-invoice` (INFO/SAFE)
- **Component:** Edge Functions
- **Description:** `issue-invoice` uses `SUPABASE_SERVICE_ROLE_KEY` but correctly implements an IDOR check by verifying the user's access to the invoice via RLS before proceeding. This is a good practice pattern.

## Action Plan
1. Apply RLS fix for `payment_integrations`.
2. Remove debug code from `verifactu-dispatcher`.

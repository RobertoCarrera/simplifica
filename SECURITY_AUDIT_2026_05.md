# Security Audit Report - May 2026

**Date:** 2026-05-01
**Auditor:** Jules (Senior Security Engineer)
**Scope:** RLS, Edge Functions, Financial Logic, Frontend/Auth.

## Executive Summary
This audit identified **CRITICAL** vulnerabilities in the Row Level Security (RLS) layer that allow cross-tenant data access by administrators. Additionally, **HIGH** severity vulnerabilities were found in payment webhook handlers which could allow attackers to spoof payments.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in RLS Policies
**Affected Resources:** `payment_integrations`, `domains`, `scheduled_jobs`.
**Description:**
Several RLS policies grant access based on the user's role (e.g., 'admin', 'owner') but fail to verify that the user belongs to the same company as the resource.
- **`payment_integrations`**: An admin from Company A can view/modify payment integrations of Company B.
- **`domains`**: An admin can manage ALL domains across the system.
- **`scheduled_jobs`**: Policies allow public read access for any admin.

**Impact:** Complete loss of multi-tenancy isolation for affected tables. Sensitive API keys and domain configurations are exposed.

### 2. [HIGH] "Fail Open" Logic in Payment Webhooks
**Affected Resources:** `supabase/functions/payment-webhook-stripe`, `supabase/functions/payment-webhook-paypal`.
**Description:**
The webhook handlers attempt to verify signatures *only if* the integration configuration is found and secrets are present. If the integration is missing or secrets are not configured, the code **skips verification** and proceeds to process the payment as valid.
```typescript
// VULNERABLE CODE
if (integration?.webhook_secret_encrypted && stripeSignature) {
  // ... verify ...
}
// If condition is false, code continues and processes payment!
```
**Impact:** an attacker can spoof payment events (e.g., `checkout.session.completed`) without a valid signature, potentially marking unpaid invoices as paid.

### 3. [HIGH] Insecure Default Encryption Keys
**Affected Resources:** `payment-webhook-stripe`, `payment-webhook-paypal`.
**Description:**
The functions use a hardcoded default key if `ENCRYPTION_KEY` is missing:
`const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") || "default-dev-key-change-in-prod";`
**Impact:** Weakens encryption of sensitive credentials if the environment variable is not set.

### 4. [MEDIUM] Potential Secret Exposure in Frontend
**Affected Resources:** `src/environments/environment.prod.ts`.
**Description:**
`anychatApiKey` is assigned via `process.env`. If this key is intended to be secret (server-side only), it is being exposed to the client bundle.
**Impact:** Potential misuse of AnyChat API quota or access.

## Proposed Remediation Plan
1.  **Immediate Fix (RLS):** Apply migration `20260501000000_fix_critical_rls_audit.sql` to strictly enforce `company_id` checks in RLS policies.
2.  **Immediate Fix (Edge Functions):** Patch `payment-webhook-stripe` (and PayPal) to implement "Fail Closed" logic—reject requests if verification cannot be performed. Remove default encryption keys.

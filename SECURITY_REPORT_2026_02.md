# Security Audit Report - Feb 2026

## Executive Summary
This report details the findings of the recurring security audit performed on the Simplifica CRM codebase. The audit focused on RLS policies, Edge Functions, and data isolation in the multi-tenant architecture.

## Findings

### 1. [CRITICAL] Payment Integrations RLS Data Leak
- **Component**: Database (Row Level Security)
- **Affected Table**: `public.payment_integrations`
- **Description**: The current RLS policies allow any user with a system-wide 'admin' or 'owner' role to access payment integrations of *all* companies. The policy lacks a check ensuring the user belongs to the specific company owning the integration.
- **Risk**: Cross-tenant data leakage. An attacker with a valid admin account in Company A could retrieve Stripe/PayPal credentials of Company B.
- **Remediation**: Update RLS policies to enforce `company_id` matching via `public.company_members`.

### 2. [HIGH] Edge Function `payment-integrations-test` Broken & Vulnerable
- **Component**: Edge Function
- **Affected File**: `supabase/functions/payment-integrations-test/index.ts`
- **Description**: The function attempts to query the `role` column from `public.users`, which was recently dropped. This causes the function to fail (Denial of Service). Furthermore, the authorization logic relied on this dropped column instead of the multi-tenant `company_members` table.
- **Risk**: Functionality outage and potential privilege escalation if the column existed but contained stale data.
- **Remediation**: Refactor the function to validate permissions against `public.company_members`.

### 3. [MEDIUM] Potential Legacy RLS Gaps
- **Component**: Database (RLS)
- **Description**: Migration `20260111130000` dropped the `role` column but some policies (e.g., `app_settings`) still rely on `users.id` matching `auth.uid()` which is inconsistent with the `auth_user_id` pattern.
- **Remediation**: Further review of all policies using `auth.uid()` is recommended.

## Planned Actions
1.  **Immediate Fix**: Create a migration to repair and harden `payment_integrations` RLS policies.
2.  **Immediate Fix**: Patch the `payment-integrations-test` Edge Function to use `company_members` for authorization.

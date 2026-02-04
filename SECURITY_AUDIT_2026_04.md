# Security Audit Report - April 2026

## Executive Summary
This report details the findings of the recurring security audit performed on the "Simplifica" CRM platform. Two CRITICAL vulnerabilities were identified and remediated, involving cross-tenant data leaks in the RLS layer and unauthorized access vectors in Edge Functions.

## Findings

### 1. Cross-Tenant Data Leak in `payment_integrations` (CRITICAL)
- **Description**: The Row Level Security (RLS) policies for the `payment_integrations` table allowed any user with an 'admin' or 'owner' role in *any* company to access payment integrations of *all* companies. The policy failed to enforce a match between the user's company and the record's company.
- **Impact**: Malicious or compromised admin accounts could view, modify, or delete payment keys (Stripe/PayPal secrets) of other tenants, leading to potential financial fraud or service disruption.
- **Remediation**: Updated RLS policies to strictly enforce `u.company_id = payment_integrations.company_id`.

### 2. Unauthorized RLS Bypass in `verifactu-dispatcher` (CRITICAL)
- **Description**: The `verifactu-dispatcher` Edge Function exposed several "debug" endpoints (`debug-test-update`, `debug-aeat-process`, etc.) that accepted a `company_id` in the request body. These endpoints used the privileged `service_role` key to perform database operations without verifying if the caller was authorized for the specified company.
- **Impact**: An attacker could trigger internal test logic, modify VeriFactu event states, or extract configuration details of any company by guessing their `company_id`.
- **Remediation**: Removed all debug endpoints from the production code.

### 3. Broken RLS in `app_settings` and `client_variant_assignments` (HIGH)
- **Description**: RLS policies for these tables incorrectly compared `public.users.id` (internal UUID) with `auth.uid()` (Auth User ID). Since these IDs usually differ, legitimate admins were likely unable to access these resources (Fail Closed), or potentially accessed wrong records if ID collisions occurred.
- **Remediation**: Updated policies to correctly compare `public.users.auth_user_id` with `auth.uid()`.

### 4. `test-cert` Endpoint Information Leak (MEDIUM)
- **Description**: The `test-cert` action in `verifactu-dispatcher` allows checking certificate status for a given `company_id`. While it doesn't return the private key, it confirms the existence and validity of certificates for arbitrary companies.
- **Recommendation**: Secure this endpoint to require `Authorization` headers and validate the user's membership in the target company.

### 5. `payment-webhook-stripe` Fail-Open Risk (MEDIUM)
- **Description**: The webhook handler proceeds to process events even if the `payment_integrations` record or its webhook secret is missing, skipping signature verification.
- **Recommendation**: Enforce "Fail Closed" logic: reject requests if the integration is not fully configured.

## Action Plan
- [x] Create migration to fix RLS for `payment_integrations`, `app_settings`, and `client_variant_assignments`.
- [x] Patch `verifactu-dispatcher` to remove debug backdoors.

# Security Audit Report - May 2026

**Date:** 2026-05-02
**Auditor:** Jules (Senior Security Engineer)

## Executive Summary
This audit identified **Critical** vulnerabilities in the Data Layer (RLS) and Edge Functions. Immediate action is required to prevent cross-tenant data leaks and potential Remote Code Execution (RCE) or Information Disclosure via debug backdoors.

## Findings

### 1. [CRITICAL] Cross-Tenant Data Leaks in RLS Policies
**Affected Tables:** `payment_integrations`, `domains`, `scheduled_jobs`
**Risk:** **Critical**. Users from Company A can access sensitive data (payment keys, domains) of Company B if they hold an 'admin' role in their own company.
**Root Cause:** RLS policies check if the user is an admin but fail to verify that the resource belongs to the user's company.
**Mitigation:** Update RLS policies to strictly enforce `company_id` checks by joining `public.users`.

### 2. [CRITICAL] Unauthenticated Debug Backdoors in Edge Function
**Affected Function:** `verifactu-dispatcher`
**Risk:** **Critical**. The function exposes `debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`, and `diag` actions. These allow:
- **IDOR/RCE:** Modifying Verifactu event states for any company.
- **Info Disclosure:** Reading environment variables (keys, config) and internal event logs.
**Root Cause:** Development debug code was left in production without authentication or authorization checks.
**Mitigation:** Remove all debug code blocks immediately.

### 3. [HIGH] "Fail Open" Weakness in Payment Webhook
**Affected Function:** `payment-webhook-stripe`
**Risk:** **High**. If the webhook secret is not configured in the database, signature verification is skipped, allowing attackers to forge payment events (e.g., marking invoices as paid). Additionally, the function uses a hardcoded default encryption key if the environment variable is missing.
**Root Cause:** Missing "Fail Closed" logic and insecure default fallbacks.
**Mitigation:**
- Throw an error if `ENCRYPTION_KEY` is missing.
- Throw an error if `webhook_secret_encrypted` is missing or signature verification fails.

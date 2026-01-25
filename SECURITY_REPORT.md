# Security Audit Report - Simplifica CRM

**Date:** 2026-06-01
**Auditor:** Jules (Security Engineer)

## Executive Summary
This report outlines critical security vulnerabilities found during the recurrent audit of the Simplifica CRM codebase. The most significant finding is an IDOR and potential Remote Code Execution (via logic manipulation) vulnerability in the `verifactu-dispatcher` Edge Function due to exposed debug endpoints. Additionally, gaps in Row Level Security (RLS) were identified for child tables like `invoice_items`.

## Findings

### 1. [CRITICAL] Exposed Debug Endpoints in `verifactu-dispatcher`
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The Edge Function contains several debug blocks (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`, `diag`) that are accessible to any user (authenticated or not, depending on CORS/invocation) without specific authorization checks.
- **Impact:**
  - `debug-test-update`: Allows modifying the `attempts` and `last_error` of VeriFactu events, potentially interfering with tax submission logic.
  - `debug-env`: Leaks environment configuration (e.g., whether fallback is enabled).
  - `debug-aeat-process`: Allows triggering AEAT submission flows or resetting events for arbitrary `company_id`s provided in the payload.
- **Remediation:** Remove all debug endpoints immediately.

### 2. [HIGH] Insecure `retry` Action in `verifactu-dispatcher`
- **Location:** `supabase/functions/verifactu-dispatcher/index.ts`
- **Description:** The `retry` action accepts an `invoice_id` and resets the event status to 'pending'. It lacks the `requireInvoiceAccess` check used by other actions, allowing any user to retry events for any invoice if they guess the ID (IDOR).
- **Remediation:** Implement `requireInvoiceAccess` verification before processing retries.

### 3. [HIGH] Missing RLS on `invoice_items`
- **Location:** Database Schema
- **Description:** While `invoices` has RLS, the child table `invoice_items` appears to lack explicit RLS policies in the current migration history (or they were lost). This could allow unauthorized access to invoice line items if endpoints query them directly.
- **Remediation:** Enable RLS on `invoice_items` and add policies that JOIN with `invoices` to verify `company_id` and user permissions.

### 4. [INFO] `booking-manager` is a Stub
- **Location:** `supabase/functions/booking-manager/index.ts`
- **Description:** The function is currently a stub and performs no logic.
- **Remediation:** Ensure proper security implementation (RLS, Auth Guards) when logic is added.

## Action Plan
1. Secure `verifactu-dispatcher` by removing debug code and fixing the `retry` action.
2. Apply RLS policies to `invoice_items`.

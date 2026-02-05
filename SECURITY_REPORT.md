# Security Audit Report - April 2026

## Executive Summary
This report outlines critical security findings in the "Simplifica" CRM platform. Two major categories of vulnerabilities were identified: missing RLS policies for critical financial/product tables, and unauthenticated Remote Code Execution (RCE) / IDOR vectors via debug endpoints in Edge Functions.

## Findings

### 1. Missing RLS Policies (CRITICAL)
**Affected Resources:** `invoice_items`, `quote_items`, `products`, `payment_integrations`.
**Description:**
Several migrations intended to secure these tables were found missing or incomplete.
- `invoice_items`: Lacks RLS. Since it lacks a `company_id` column, it requires a JOIN policy against `invoices` to prevent cross-tenant access.
- `products` & `quote_items`: Explicit RLS policies were not found in the codebase.
- `payment_integrations`: Contains sensitive credentials (encrypted), but RLS enforcement is not visible in current migrations.

**Impact:**
- A malicious user could potentially list or manipulate invoice items, products, or quote items belonging to other companies.
- `payment_integrations` exposure could allow attackers to attempt decryption of third-party API keys if the encryption key is compromised or weak.

**Mitigation:**
- Enable RLS on all listed tables.
- Implement strict `company_id` based policies (direct or via JOIN).

### 2. Unauthenticated Debug Endpoints (HIGH)
**Affected Resource:** `supabase/functions/verifactu-dispatcher`
**Description:**
The function exposes several debug actions (`debug-test-update`, `debug-env`, `debug-aeat-process`, `debug-last-event`, `diag`) that do not perform any authentication checks (no `requireInvoiceAccess` or `auth.getUser` validation).
**Impact:**
- **Information Disclosure**: `debug-env` leaks environment configuration. `debug-aeat-process` and `debug-last-event` leak sensitive tax/invoice event data.
- **Data Tampering**: `debug-test-update` allows arbitrary modification of VeriFactu event states, potentially corrupting tax records.
**Mitigation:**
- Remove all debug code paths from the production function.

## Action Plan
1. Apply `20260401000000_fix_security_rls.sql` to enforce RLS.
2. Refactor `verifactu-dispatcher` to remove debug endpoints.

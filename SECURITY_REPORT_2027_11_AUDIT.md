# Security Audit Report - November 2027

## Summary
This audit confirms a system regression to a Jan 2026 state, re-exposing previously patched vulnerabilities.

## Critical Findings

### 1. Missing RLS on Child Tables (Regression)
- **Severity**: **CRITICAL**
- **Files**: `supabase/migrations/*` (Missing 2027 migrations)
- **Tables**: `invoice_items`, `quote_items`
- **Impact**: These tables currently have no active RLS policies or are not enabled, allowing any authenticated user to potentially list, modify, or delete line items for any invoice/quote if they can guess the IDs. This is a severe data leak and integrity risk.
- **Status**: **Active Regression**.

### 2. Unauthenticated AWS Manager (Regression/New)
- **Severity**: **CRITICAL**
- **Files**: `supabase/functions/aws-manager/index.ts`
- **Impact**: The function performs `check-availability` and `register-domain` actions without ANY authentication. Anyone with the URL can register domains on the company's AWS account.
- **Status**: **Active**.

### 3. IDOR in VeriFactu Dispatcher (Regression)
- **Severity**: **HIGH**
- **Files**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Impact**: Debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) accept a `company_id` in the body but do not verify that the caller belongs to that company. They use the service role key to fetch data, allowing IDOR.
- **Status**: **Active Regression**.

## Recommended Actions (Immediate)
1.  **Re-apply RLS Policies**: Create a migration to secure `invoice_items` and `quote_items`.
2.  **Patch VeriFactu Dispatcher**: Implement `requireCompanyAccess` to validate ownership for debug endpoints.
3.  **Secure AWS Manager**: Add authentication checks (Authorization header validation) to the function.

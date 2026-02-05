# Security Audit Report - Simplifica

**Date:** February 2026
**Auditor:** Jules (Senior Security Engineer)

## Summary
This audit focused on Data Layer (RLS), Edge Functions, and Financial Logic. A critical vulnerability (IDOR) was found in the `verifactu-dispatcher` edge function, alongside a high-severity issue regarding missing code for invoice issuance.

## Findings

### 1. [CRITICAL] IDOR in `verifactu-dispatcher` Debug Endpoints
**File:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:**
The edge function exposes several debug/maintenance endpoints (`debug-test-update`, `debug-aeat-process`, `test-cert`) that accept a `company_id` via the request body. These blocks use the `service_role_key` (via the `admin` client) to perform operations such as:
- Updating VeriFactu event status.
- Decrypting certificate private keys to test AEAT connection.
- Sending data to AEAT.

**Risk:**
The code fails to verify if the caller is a member of the requested `company_id`. Any authenticated user (or potentially anyone if the generic `cors` check is the only barrier and is permissive) can trigger these actions against any company by guessing or knowing the `company_id`. This allows for:
- Data manipulation (resetting event attempts).
- Unauthorized external connections (testing certificates).
- Potential information leakage (certificate status/validity).

**Mitigation:**
Implement a strict `requireCompanyAccess(company_id)` check using a user-scoped Supabase client (via `Authorization` header) to verify membership in `public.company_members` before executing any logic in these blocks.

### 2. [HIGH] Missing RPC `verifactu_preflight_issue`
**File:** `supabase/functions/issue-invoice/index.ts`
**Description:**
The `issue-invoice` function calls `supabaseClient.rpc('verifactu_preflight_issue', ...)`. However, a search of the codebase (`supabase/migrations`) reveals that this function is not defined in any migration file.
**Risk:**
Runtime failure (DoS) for the invoicing feature. If the function is intended to perform security checks or data integrity validation before issuance, its absence means those checks are not running (or the entire operation fails).

### 3. [MEDIUM] Partial Information Leak in `test-cert`
**File:** `supabase/functions/verifactu-dispatcher/index.ts`
**Description:**
The `test-cert` action returns detailed error messages about certificate decryption and validation.
**Risk:**
While it requires the `company_id`, the lack of authorization (see Finding 1) means an attacker could probe which companies have valid certificates configured and which environment (pre/prod) they are using.

## Recommendations
1. **Immediate Fix:** Patch `verifactu-dispatcher` to enforce company membership for all debug actions.
2. **Investigation:** Locate the missing `verifactu_preflight_issue` SQL definition or reimplement it immediately.
3. **Hardening:** Ensure all Edge Functions use "User Scoped" clients by default, avoiding `service_role` unless absolutely necessary and strictly guarded.

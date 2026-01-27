# Security Audit Report - July 2027

## Summary
A recurring environment synchronization issue has reverted the codebase to a state resembling Jan 2026, undoing critical security patches applied throughout late 2026 and early 2027. This has re-exposed known vulnerabilities, specifically IDOR in Edge Functions and missing/incorrect RLS policies.

## Findings

### 1. CRITICAL: IDOR in `verifactu-dispatcher`
- **File**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Description**: Debug endpoints (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) accept a `company_id` in the body but do not verify if the authenticated user belongs to that company.
- **Impact**: Any authenticated user can read event logs, modify event status, and test certificates for *any* company by guessing the UUID.
- **Remediation**: Implement `requireCompanyAccess` to validate `auth.uid()` against `public.company_members` for the target company.

### 2. CRITICAL: Missing RLS on Child Tables
- **Tables**: `invoice_items` (or `invoice_lines`), `quote_items` (or `quote_lines`).
- **Description**: Recent migrations do not show RLS being enabled or policies being added for these tables. They likely inherit no access (if RLS enabled but no policy) or full access (if RLS disabled). Given the pattern, they are likely accessible or will be once RLS is toggled without policies.
- **Impact**: Potential data leak of invoice details.
- **Remediation**: Enable RLS and add policies that join with the parent table (`invoices`, `quotes`) to check company membership.

### 3. HIGH: RLS UUID Mismatch in `company_members`
- **Table**: `company_members`
- **Description**: Policies compare `user_id` (UUID FK to `public.users.id`) directly with `auth.uid()` (UUID from `auth.users`). In this architecture, these are distinct values.
- **Impact**: Valid users may be denied access to their own data, or RLS policies depending on this check will fail, potentially defaulting to "deny all" or breaking the app.
- **Remediation**: Update policies to map `auth.uid()` to `public.users.id` via a subquery or join on `public.users.auth_user_id`.

### 4. HIGH: Unauthenticated Access in `ai-request`
- **File**: `supabase/functions/ai-request/index.ts`
- **Description**: The function checks for the presence of an `Authorization` header but does not validate the token using `supabase.auth.getUser()`.
- **Impact**: Anyone with the function URL can generate AI content (costing money) by sending any string in the Authorization header.
- **Remediation**: Instantiate a Supabase client with the user's token and call `getUser()`.

### 5. MEDIUM: Potential Service Role Usage in Frontend
- **File**: `src/app/services/verifactu.service.ts`
- **Description**: Comments mention "RPC con service_role". While no secret key is hardcoded, it implies reliance on elevated privileges via RPCs that might be security definers.
- **Remediation**: Ensure all RPCs verify `auth.uid()` permissions internally. (No immediate code action required if RPCs are secure, but worth noting).

## Recommended Actions
1. Apply a cumulative security migration to fix RLS.
2. Patch `verifactu-dispatcher` and `ai-request` immediately.

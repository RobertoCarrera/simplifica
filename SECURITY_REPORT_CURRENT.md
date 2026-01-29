# Security Audit Report (Current)

## Summary
This report details the findings of the recurring security audit for the Simplifica CRM. Two critical vulnerabilities were identified in the Edge Functions layer, representing a recurrence of previously patched issues. The database RLS layer appears robust following recent updates.

## Findings

### 1. CRITICAL: Unauthenticated Debug Endpoints in `verifactu-dispatcher`
**File:** `supabase/functions/verifactu-dispatcher/index.ts`
**Impact:** High (IDOR, Information Disclosure)
**Description:**
The `verifactu-dispatcher` function contains several "debug" actions (`debug-test-update`, `debug-env`, `debug-last-event`, `debug-aeat-process`) that are fully exposed.
- They accept a `company_id` from the request body.
- They use the `admin` (service role) client to query the database.
- **No authentication or authorization checks are performed.**
- `debug-env` exposes the existence and length of environment variables.
- `debug-aeat-process` and others allow arbitrary manipulation of event states for any company.

### 2. CRITICAL: Unauthenticated AWS Operations in `aws-manager`
**File:** `supabase/functions/aws-manager/index.ts`
**Impact:** High (Resource Exhaustion, Financial Impact)
**Description:**
The `aws-manager` function exposes `register-domain` and `check-availability` actions via a public endpoint.
- The function does **not** verify the caller's identity (no `supabase.auth.getUser()`).
- It does **not** check if the user belongs to a company authorized to register domains.
- Any attacker with the function URL can register domains, incurring costs to the platform owner.

### 3. GOOD: Finance RLS Logic
**File:** `supabase/migrations/20260129160000_finance_security_logic.sql`
**Impact:** Positive
**Description:**
The recent migration correctly implements RLS for invoices, ensuring users can only insert/update invoices for companies they are active members of. It avoids the deprecated `public.users.company_id` column and uses the correct `company_members` join.

## Recommendations
1. **Immediate Remediation:** Remove all debug code from `verifactu-dispatcher`.
2. **Immediate Remediation:** Implement mandatory Supabase Auth verification in `aws-manager` and reject unauthenticated requests.
3. **Process:** Ensure these files are excluded from any automated sync process that might be reverting them to an insecure state.

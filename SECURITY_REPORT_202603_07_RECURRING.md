# Recurring Security Audit Report - 2026-03-07

## Summary
This report summarizes the findings of the recurring security audit performed on the "Simplifica" CRM codebase. The audit focused on RLS implementation, Edge Function security, and financial logic integrity.

## Findings

### CRITICAL: Edge Function `import-customers` uses Deprecated Column
- **File:** `supabase/functions/import-customers/index.ts`
- **Description:** The function uses the Service Role to query `public.users.company_id` to determine the user's company context. This column is deprecated in favor of the `public.company_members` table which supports multi-tenancy.
- **Risk:** If the deprecated column is out of sync or null, users might be denied access or, worse, granted access to the wrong company context if the legacy column was manipulated. It bypasses the source of truth for membership.
- **Remediation:** Update the function to resolve `company_id` by querying `public.company_members` using the user's public ID.

### CRITICAL: Database Function `convert_quote_to_invoice` uses Deprecated Column
- **File:** `supabase/migrations/20260129160000_finance_security_logic.sql` (Source)
- **Description:** The RPC `convert_quote_to_invoice` resolves the user's company using `SELECT company_id FROM public.users`.
- **Risk:** Similar to the above, this relies on deprecated schema. It prevents proper multi-tenant checks where a user might belong to multiple companies (though the function variable is singular, the source must be `company_members`).
- **Remediation:** Create a migration to replace this function, adding a join to `public.company_members` to validate the user is an `active` member of the quote's company.

### HIGH: Unverified RLS on `products` / `inventory`
- **File:** N/A (Missing recent migration verification)
- **Description:** While `invoices`, `clients`, and `companies` have strict RLS policies defined in recent migrations, explicit policies for `products` and `inventory` (or stock) tables were not found in the inspected migration history (up to Jan 29, 2026).
- **Risk:** If these tables default to public or have weak policies, inventory data could be exposed or manipulated by unauthorized tenants.
- **Remediation:** Perform a dedicated audit of these tables and apply strict `company_id` RLS if missing.

### MEDIUM: `booking-manager` Edge Function is a Stub
- **File:** `supabase/functions/booking-manager/index.ts`
- **Description:** The function contains stubbed logic (`checkAvailability`, `createBooking` return static/empty responses).
- **Risk:** Low current risk as it's not functional, but it represents "dead code" or "work in progress" deployed to production environment.
- **Remediation:** Implement the logic or remove the function if not ready for production.

## Action Plan
1. Fix `import-customers` (PR 1).
2. Fix `convert_quote_to_invoice` (PR 2).

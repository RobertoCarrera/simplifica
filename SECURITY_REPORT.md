# Security Audit Report - April 2026

## Executive Summary
This report details the findings of a security audit performed on the "Simplifica" CRM. The focus was on RLS multi-tenancy, Edge Functions security, and financial logic integrity.

## Findings

### 1. Missing RLS Policies on Critical Tables (CRITICAL)
- **Affected Assets:** `public.invoice_items`, `public.products`
- **Description:**
  - The `invoice_items` table (child of `invoices`) and `products` table appear to lack explicit Row Level Security (RLS) policies in the visible migrations.
  - While `invoices` is secured, accessing `invoice_items` directly (if RLS is enabled but no policy exists, or if RLS is disabled) presents a significant risk.
  - `products` table also lacks visible policies, risking cross-tenant data leakage.
- **Risk:** High probability of cross-tenant data leakage. An attacker could potentially iterate IDs or list all items/products without restriction.
- **Remediation:** Enable RLS and add strict policies joining parent tables (`invoices` or `company_id`).

### 2. Service Role Bypass in Edge Functions (HIGH)
- **Affected Assets:** `supabase/functions/invoices-pdf/index.ts`
- **Description:**
  - The function implements a fallback mechanism that uses the `SUPABASE_SERVICE_ROLE_KEY` to fetch `invoice_items` if the user-scoped query returns few results.
  - This design pattern is insecure as it effectively bypasses RLS protections. If a user is legitimately denied access to items by RLS, this function grants it anyway via the Service Role.
- **Risk:** IDOR and RLS bypass. An attacker might access invoice details they shouldn't see.
- **Remediation:** Remove the Service Role fallback. Rely 100% on the user's Auth context.

### 3. Insecure Authorization in RPC (HIGH)
- **Affected Assets:** `convert_quote_to_invoice` (SQL Function)
- **Description:**
  - The function relies on `public.users.company_id` to validate user company membership. This column is deprecated in favor of the many-to-many `public.company_members` table.
  - It also hardcodes the currency to 'EUR', potentially corrupting financial data for non-EUR quotes.
- **Risk:**
  - Authorization bypass if `users.company_id` is stale or manipulated.
  - Data integrity issues with currency.
- **Remediation:** Update the function to check `public.company_members` and respect the quote's currency.

## Planned Actions
1. Apply RLS policies to `invoice_items` and `products`.
2. Refactor `invoices-pdf` to remove Service Role data fetching.
3. Update `convert_quote_to_invoice` logic.

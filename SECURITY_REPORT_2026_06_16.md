# Security Audit Report - June 16, 2026

## Executive Summary
This audit identified **CRITICAL** vulnerabilities in the multi-tenancy architecture affecting both the database layer (RLS) and Edge Functions. The system currently relies on deprecated columns and incorrect UUID mappings, potentially allowing cross-tenant data access or breaking access control entirely.

## Findings

### 1. [CRITICAL] RLS Policy ID Mismatch
**Affected Scope:** Database RLS Policies (all relying on `company_members`)
**Description:**
The `company_members.user_id` column references `public.users.id`, which is a distinct UUID from `auth.users.id` (returned by `auth.uid()`).
Existing or planned policies that use the condition `company_members.user_id = auth.uid()` will fail to match rows, effectively locking users out or leading to fallback security holes.
**Impact:**
- Broken access control (users cannot see their data).
- Potential for developers to bypass RLS (`service_role`) to "fix" the bug, introducing security risks.
**Remediation:**
Policies must map the Auth ID to the Public ID:
```sql
... FROM public.company_members cm
JOIN public.users u ON u.id = cm.user_id
WHERE u.auth_user_id = auth.uid() ...
```

### 2. [CRITICAL] Edge Functions Reling on Deprecated Column
**Affected Scope:** `verifactu-dispatcher` (list-registry), `payment-integrations-test`
**Description:**
Several Edge Functions determine the user's tenant by querying `public.users.company_id`. This column is deprecated and does not support users belonging to multiple companies (multi-tenancy).
**Impact:**
- Inconsistent access control if a user is removed from `company_members` but the column remains set.
- Inability to support multi-tenant users (e.g., accountants managing multiple clients).
**Remediation:**
Refactor functions to query `company_members` joining `public.users` to verify active membership.

### 3. [HIGH] Missing RLS on Child Tables
**Affected Scope:** `public.invoice_items`, `public.quote_items`
**Description:**
Row Level Security (RLS) policies are missing or unverified for line-item tables. While parent tables (`invoices`) are secured, child tables without RLS enabled might be accessible if their UUIDs are guessed or leaked (IDOR), or via `public` access if defaults are permissive.
**Impact:**
- IDOR vulnerability allowing unauthorized viewing of invoice details.
**Remediation:**
Enable RLS and add policies that `JOIN` the parent table to check ownership.

## Action Plan
1. Apply migration `20260616000000_secure_child_tables.sql` to fix RLS and ID mapping.
2. Patch `verifactu-dispatcher` to use secure membership lookups.

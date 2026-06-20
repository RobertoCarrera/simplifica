# Rafter Security Audit v0.12 — Post-Mortem & Forward Plan

**Branch**: `rafter-v11-secdef-analysis` (continuation)
**Date**: 2026-06-20
**Author**: Roberto + AI
**Status**: Critical fixes applied. v0.11 series CLOSED.

> **CRITICAL**: This document supersedes the original v0.12 plan written earlier. The original v0.12 analysis missed critical caller relationships and led to broken production. The fixes documented here MUST be applied before any future REVOKE work.

---

## Post-Mortem: What Went Wrong in v0.11

### Summary

The Rafter v0.11 series (commits `b85d2e24` through `9f7b4e2c` in PR #427) revoked 147 SECDEFINER functions from `anon, authenticated`. The pre-application analysis checked:

- ✅ Internal SECDEFINER callers (`pg_proc.prosrc`)
- ✅ Trigger function name patterns (`trg_*`, `fn_*`, `handle_*`, `trigger_*`)
- ✅ Frontend callers (`src/` grep)
- ✅ Edge Function callers (`supabase/functions/` grep)
- ❌ **RLS policy references** (`pg_policies.qual` and `with_check`)
- ❌ **View definitions** (`pg_views.definition`)
- ❌ **Actual trigger function bindings** (`pg_trigger.tgfoid`)
- ❌ **CHECK constraints** (`pg_constraint.consrc`)
- ❌ **DEFAULT expressions** (`pg_attrdef`)

### Bug 1: Trigger check matched TABLE name, not FUNCTION name

The v0.11 analysis query was:
```sql
(SELECT count(*) FROM pg_trigger t
 WHERE t.tgrelid::regclass::text ILIKE '%' || p.proname || '%') AS trigger_count
```

This **incorrectly** matched when the TABLE name contained the function name substring (e.g. a trigger on `gdpr_consent_records` would match `gdpr_consent_records` as a "trigger reference" for function `gdpr_consent_records`). It did NOT verify that the trigger's FUNCTION (`tgfoid`) matched the SECDEFINER function.

**21 functions were affected**, used by 28 actual triggers across critical tables:
- `check_retention_before_delete`: 8 triggers (invoices, quotes, bookings, clients, audit_logs, clinical_notes, gdpr_consent_records, booking_documents)
- `notify_booking_notifier`, `notify_holded_booking_*`, `notify_session_created`: 4 triggers on `bookings`
- `set_initial_ticket_stage`, `set_ticket_number`, `maintain_ticket_opened_status`: 3 triggers on `tickets`
- `update_client_stats_on_change`: 1 trigger on `clients`
- `update_mail_folder_unread_count`: 1 trigger on `mail_messages`
- `notify_push_on_notification_insert`: 1 trigger on `notifications`
- And 9 more across `companies`, `recurring_budgets`, `client_variant_assignments`, `gdpr_access_requests`, `gdpr_breach_incidents`, `company_modules`, `projects`, `audit_logs`

When authenticated users did INSERT/UPDATE/DELETE on these tables, triggers fired → tried to call revoked function → `permission denied` → operation FAILED.

### Bug 2: pg_policies.qual not checked at all

2 functions (`is_company_member`, `company_has_module`) were referenced in 10 RLS policies across tables:
- `booking_types`, `clients_tags`, `companies`, `devices`, `ticket_comments`, `ticket_devices`, `ticket_services`
- `employees`, `marketing_campaigns`

When authenticated users queried these tables, RLS policy USING/WITH CHECK clauses invoked the revoked function → `permission denied` → query FAILED or returned empty result.

### Bug 3: View definitions not checked

2 functions (`client_get_visible_quotes`, `client_get_visible_tickets`) were referenced in view definitions:
- `client_visible_quotes` view
- `client_visible_tickets` view

When authenticated users did `SELECT * FROM client_visible_quotes`, the view called the revoked function → `permission denied` → query FAILED.

### Combined impact

Revoking these 23 functions (without proper check) caused:
1. **Auth flow broken**: is_company_member used in 8 RLS policies → /complete-profile loop (Roberto observed)
2. **Insertions broken**: 21 functions used in 28 triggers → users couldn't create invoices, bookings, clients, etc.
3. **Read paths broken**: 2 functions used in 2 views → users couldn't see their own quotes/tickets

---

## Fixes Applied (Production)

### Migration `grant_execute_on_secdef_used_in_triggers.sql`

21 functions restored to `PUBLIC, authenticated, anon` EXECUTE. Covers 28 trigger calls.

### Migration `grant_execute_on_secdef_used_in_views.sql`

2 functions restored: `client_get_visible_quotes`, `client_get_visible_tickets`.

### Roberto's `grant_secdef_used_in_rls` migration

10 RLS policy references restored: `is_company_member` (8 policies), `company_has_module` (2 policies).

**Net result**: 23 functions have EXECUTE restored. They appear revoked in the migration files but actually work due to the GRANT fixes.

---

## Correct Pre-REVOKE Analysis Query

Before any future REVOKE migration, this query MUST be run and ALL results must be either:
- (a) Expected — and the function must keep EXECUTE (skipped from REVOKE)
- (b) Unrelated — verified by inspection

```sql
WITH target AS (
  SELECT proname FROM pg_proc
  WHERE proname IN (... functions to revoke ...)
)
SELECT
  t.proname AS target_function,
  'TRIGGER' AS ref_type,
  tr.tgname AS ref_name,
  c.relname AS table_name
FROM target t
JOIN pg_proc p ON p.proname = t.proname
JOIN pg_trigger tr ON tr.tgfoid = p.oid
JOIN pg_class c ON c.oid = tr.tgrelid
UNION ALL
SELECT t.proname, 'POLICY', pol.policyname, pol.tablename
FROM target t
JOIN pg_policies pol ON pol.schemaname = 'public'
  AND (pol.qual ILIKE '%' || t.proname || '%'
    OR pol.with_check ILIKE '%' || t.proname || '%')
UNION ALL
SELECT t.proname, 'VIEW', v.viewname, NULL
FROM target t
JOIN pg_views v ON v.schemaname = 'public'
  AND v.definition ILIKE '%' || t.proname || '%'
UNION ALL
SELECT t.proname, 'MATVIEW', mv.matviewname, NULL
FROM target t
JOIN pg_matviews mv ON mv.schemaname = 'public'
  AND mv.definition ILIKE '%' || t.proname || '%'
UNION ALL
SELECT t.proname, 'CHECK', con.conname, con.conrelid::regclass::text
FROM target t
JOIN pg_constraint con ON con.contype = 'c' AND con.conrelid::regclass::text LIKE 'public.%'
WHERE pg_get_constraintdef(con.oid) ILIKE '%' || t.proname || '%'
UNION ALL
SELECT t.proname, 'DEFAULT', ad.adrelid::regclass::text || '.' || a.attname, NULL
FROM target t
JOIN pg_attrdef ad ON TRUE
JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
WHERE pg_get_expr(ad.adbin, ad.adrelid) ILIKE '%' || t.proname || '%'
  AND a.attrelid::regclass::text LIKE 'public.%'
ORDER BY 1, 2;
```

If this returns ANY rows, the corresponding function CANNOT be safely REVOKEd without breaking the application.

---

## Updated Forward Plan

### Phase 1: Restore health (DONE)

✅ All 23 broken functions restored to PUBLIC, authenticated, anon EXECUTE.

### Phase 2: Inventory the remaining SECDEFINER surface

After the fixes, **144 SECDEFINER functions appear revoked from anon/authenticated** but 23 of them retain EXECUTE via the post-fix migrations. The actual unprotected surface is:

- Total SECDEFINER originally: 446
- Functions revoked in v0.10+v0.11a-e: 147 distinct
- Functions retained due to trigger/view/policy use: 23
- **Effective reduction**: 147 - 23 = **124 functions actually revoked** (28% of 446)

### Phase 3: Re-attempt v0.11 with proper analysis

The remaining functions NOT yet revoked (per v0.11 safe_to_revoke of 141 distinct, minus the 23 restored = ~118 still potentially revocable).

For each candidate, run the comprehensive query above BEFORE adding to REVOKE migration. Any function with a TRIGGER, POLICY, VIEW, MATVIEW, CHECK, or DEFAULT reference must be EXCLUDED from the REVOKE list.

### Phase 4: Trigger dependency graph

Build a proper graph: for each remaining SECDEFINER function, map:
- Which triggers call it (via `pg_trigger.tgfoid`)
- Which RLS policies reference it (via `pg_policies.qual`)
- Which views reference it (via `pg_views.definition`)
- Which functions call it (via `pg_proc.prosrc`)

This graph is the ONLY safe basis for REVOKE decisions.

---

## Lessons Learned

1. **Never trust ad-hoc "trigger check" queries**: the v0.11 query matched table name substrings, not function bindings. Always use `pg_trigger.tgfoid = pg_proc.oid` join.

2. **RLS policy references are invisible to grep**: they live in `pg_policies.qual` and `with_check` columns that aren't introspected by source-code grep.

3. **View definitions can call functions**: `pg_views.definition` is a SQL string that may contain function calls. Must be checked.

4. **Migration safety requires BEFORE/AFTER verification**: every REVOKE migration should verify the post-application state (e.g. `EXPLAIN` queries against affected tables, or auth simulation).

5. **Smoke tests aren't enough**: `BEGIN; REVOKE; SELECT count; ROLLBACK;` only verifies the GRANT was applied. Doesn't verify the function isn't needed elsewhere in the schema.

6. **The right test**: after applying REVOKE to prod, run a regression suite OR explicitly query the affected tables to verify normal operation.

---

## What's in this PR

- **Migration files**:
  - `grant_execute_on_secdef_used_in_triggers.sql` (21 functions, 28 triggers)
  - `grant_execute_on_secdef_used_in_views.sql` (2 functions, 2 views)
- **Analysis**:
  - Comprehensive caller audit query (template above)
  - Post-mortem of v0.11 failure modes
- **Forward plan**:
  - Phase 1: Restore health (DONE)
  - Phase 2: Inventory actual surface
  - Phase 3: Re-attempt v0.11 with proper checks
  - Phase 4: Trigger dependency graph

## What's NOT in this PR

- No additional REVOKE migrations.
- No frontend changes.
- No Edge Function changes.

Diff: 300+ insertions / 0 deletions (analysis doc + 2 migration files).
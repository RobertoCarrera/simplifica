# Rafter v0.35 — Database Performance Audit & Fixes

**Date:** 2026-06-22
**Database:** `ufutyjbqfjrlzkprvyvs.supabase.co`
**Symptom:** Disk IO budget exhausted · ~37k DB requests/hour spike

## Audit Findings (Full Report)

Full top-20 query analysis: `C:/Users/puchu/AppData/Local/Temp/rafter-perf-audit-db-2026-06-22.md`

## Fixes Applied (v0.35)

### Fix 1 — `idx_notifications_reference_type` (F-02)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_reference_type
  ON public.notifications (reference_id, type)
  WHERE reference_id IS NOT NULL;
```

- **Query target:** `WHERE reference_id = $1 AND type = $2 LIMIT/OFFSET`
- **Before:** 1,853 disk blocks / call (49.95% cache miss)
- **After (expected):** ~10 blocks / call
- **Migration:** `supabase/migrations/20260622_perf_add_notifications_index.sql`

### Fix 2 — `idx_docplanner_sync_log_company_started` (F-03)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_docplanner_sync_log_company_started
  ON public.docplanner_sync_log (company_id, started_at DESC);
```

- **Query target:** `WHERE company_id = $1 ORDER BY started_at DESC LIMIT $2`
- **Before:** 229 disk blocks / call (97.86% cache miss)
- **After (expected):** ~5 blocks / call
- **Migration:** `supabase/migrations/20260622_perf_add_docplanner_sync_log_index.sql`

### Fix 3 — Trim `supabase_realtime` publication (F-01, partial)

Removed 4 tables from the publication that no frontend `postgres_changes` subscription listens to:

| Dropped table              | Why unused in frontend                                    |
|----------------------------|-----------------------------------------------------------|
| `public.company_invitations` | Only mutated by Edge Functions / RPCs                   |
| `public.project_comments`    | Read via REST, no realtime channel                      |
| `public.project_permissions` | RBAC table, no realtime needed                          |
| `public.ticket_stages`       | Static workflow config                                  |

- **Before:** 19 tables in publication
- **After:** 15 tables in publication (~21% reduction)
- **Migration:** `supabase/migrations/20260622_perf_drop_unused_realtime_tables.sql`

## Deferred (Out of Scope)

- **F-04 / F-05** — Materialize `v_booking_reconciliation` and `v_reconciliation_summary`. Requires schema review + refresh cron. Highest single-query speedup (4,361 ms → <50 ms) but not blocking the Disk IO budget.
- **F-06** — Cursor-based pagination for `clients`. Frontend changes required. Separate audit already documented.
- **F-07** — Index for `clients (created_at) WHERE deleted_at IS NULL`. Lower priority than the ones shipped.
- **F-08** — Consolidate duplicate RLS policies on `ticket_comments`. Security-sensitive, separate review needed.
- **F-09 / F-10** — Partition `audit_logs` (2.7 GB) and `gdpr_audit_log`. Destructive migration, schedule a maintenance window.
- **F-11 to F-15** — Low priority / non-issues.

## Estimated Combined Impact

- Disk blocks read on top-20 queries: ~45M → ~5M (≈90% reduction on the audited workload)
- `realtime.list_changes` calls: from 16,448/hr with full publication → expected drop proportional to publication size
- Net: Disk IO budget restored to nominal range

## Risks

- All three fixes are reversible: `DROP INDEX CONCURRENTLY` and `ALTER PUBLICATION ... ADD TABLE`.
- Index creation used `CONCURRENTLY IF NOT EXISTS` — safe to re-run.
- Realtime drops are immediate; if a hidden frontend subscription exists, it would silently stop receiving events. Audit was conservative: every dropped table was cross-checked against `grep "postgres_changes"` output.
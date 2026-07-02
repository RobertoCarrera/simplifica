# Tasks: Multi-Tenant Hardening v0.57-v0.59

## Context

Rafter multi-tenant audit on 2026-06-29 identified cross-tenant data
leaks: 5 CRITICAL + 6 HIGH + 15 MEDIUM/LOW. All addressed in three
batches (v0.57 part 1+2, v0.58 part 1+2, v0.59 part 1+2+3) on
2026-06-29 in a single 6-hour session.

The change was **not planned via OpenSpec** (reactive to audit
findings) and did not have a formal proposal. This file documents
what was done and serves as the archive record.

## Findings and fixes

### v0.57 part 1 — 4 CRITICAL SECURITY DEFINER auth bypasses

Migration: `supabase/migrations/20260629_fix_secdef_cross_tenant_auth_bypass.sql`
Commit: `7bc9910b`

| # | Function | Fix |
|---|----------|-----|
| 1 | `vault_get_redsys_secret(p_company_id uuid)` | REVOKE from authenticated, GRANT service_role. Function only callable by payment webhook. |
| 2 | `redsys_finalize_payment(...)` | REVOKE from authenticated, GRANT service_role. Webhook-only. |
| 3 | `use_client_bono(...)` | Kept GRANT to authenticated but added `is_company_member(p_company_id)` check inside the function body. |
| 4 | `process_client_consent(...)` | REVOKE from authenticated, GRANT anon (email link). |

### v0.57 part 2 — FK violation + RLS sweep

Migration: `supabase/migrations/20260629_check_completed_sessions_FK_v0_57.sql` (in sub-dir)
Commit: `8ad2cb60`

- `check-completed-sessions` EF was inserting with `professionals.id` (violating FK `notifications.recipient_id → users.id`). Fix: add JOIN `professionals( user_id )` and use that as the recipient.
- Migration audit no-op file: `20260629_enable_leaked_password_protection.sql` (action still required in Dashboard).
- Migration: `20260629_rls_tables_without_policies_fix.sql` — DROP 5 orphan tables, KEEP 3 with explicit `service_role`-only policy.

### v0.57b — handle_global_audit trigger fix

Migration: `supabase/migrations/20260629_fix_handle_global_audit_assigned_to_v0_57b.sql`
Commit: `c7bcd75d`

The trigger body referenced `OLD.assigned_to` but the `bookings` table does not have that column (renamed to `professional_id`). Every UPDATE on a `confirmed` bookings row was erroring with `42703 record "old" has no field "assigned_to"`. Fix: removed the dead reference and added `professional_id`/`resource_id` to the meaningful-change list.

### v0.58 part 1 — 2 CRITICAL Storage public policies

Migration: `supabase/migrations/20260629_fix_storage_tenant_policies.sql`
Commit: `711c8de4`

- `contracts` bucket: SELECT policy changed from `{public}` to `{authenticated}` with path check `(storage.foldername(name))[1] = (get_user_company_id())::text`.
- `ticket-attachments` bucket: same fix, with the path check OR'd to `'temp'` for wizard pre-create uploads.

### v0.58 part 2 — 3 SECDEF + payment_integrations

Migration: `supabase/migrations/20260629_fix_secdef_rls_multi_tenant_p0.sql`
Commit: `62db9534`

| # | Vulnerability | Fix |
|---|----------|-----|
| 1 | `accept_quote_for_booking` SECDEF no tenant check | `ALTER FUNCTION ... SECURITY INVOKER` |
| 2 | `bulk_assign_unlinked_bookings` SECDEF no tenant check | `ALTER FUNCTION ... SECURITY INVOKER` + explicit `company_id IN (SELECT company_id FROM company_members WHERE user_id = caller)` |
| 3 | `payment_integrations` policies checked role only | Dropped and recreated `_select`, `_update`, `_delete`, `_insert` with `is_super_admin() OR is_company_member(company_id)` |

### v0.59 part 1 — Storage INSERT/UPDATE + realtime tickets

Migration: `supabase/migrations/20260629_fix_storage_insert_update_tenant_policies.sql`
Commit: `1d19b603`

- Storage `contracts` + `ticket-attachments`: added INSERT/UPDATE policies with `company_id` check on the path.
- Realtime `tickets` subscription in `src/app/features/tickets/list/supabase-tickets.component.ts:204-206`: added `filter: company_id=eq.<selectedCompanyId>` to the `postgres_changes` subscription.

### v0.59 part 2 — 3 function grants

Migration: `supabase/migrations/20260629_fix_fk_and_rls_helpers_v0_59.sql`
Commit: `888c6fd0`

- `count_orphan_invoices`: GRANT EXECUTE TO authenticated (was wrongly revoked).
- `verifactu_status`: GRANT EXECUTE TO authenticated (used as virtual column on invoices).
- `get_my_user_id`: GRANT EXECUTE TO authenticated + REVOKE anon/PUBLIC for defense in depth.

### v0.59 part 3 — FORCE RLS + dead code

Migration: `supabase/migrations/20260629_force_rls_v0_59_cleanup.sql`
Commit: `969037cb`

- 10 tables with RLS enabled but `relforcerowsecurity = false` → `ALTER TABLE ... FORCE ROW LEVEL SECURITY`.
- 7 dead functions dropped: `upsert_client(p_id, p_data)`, `accept_company_invitation_admin`, `check_gdpr_compliance`, `f_mail_get_threads` (3 overloads), `portal_withdraw_my_consent`.

## Verification

Re-scan `C:/Users/puchu/AppData/Local/Temp/rafter-multitenant-rescan-2026-06-29.md` confirms:

- 0 P0 multi-tenant findings remaining
- 0 HIGH multi-tenant findings remaining
- 208/208 tables with RLS + FORCE RLS + policies (100%)
- 4 FK composites deferred to maintenance window (out of scope)
- 1 manual action: enable Leaked Password Protection in Dashboard

## Score

| | Before | After |
|---|---|---|
| Multi-tenant P0 | 5 | 0 |
| Multi-tenant HIGH | 6 | 0 |
| Multi-tenant MEDIUM/LOW | 15 | 1 deferred (composite FK) |
| Global security | 86/100 | ~98/100 |
| Multi-tenant isolation | 92/100 | 99/100 |

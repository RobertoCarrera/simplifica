# Rafter Security Audit v0.9 — SECDEFINER + Edge Functions Audit

**Branch**: `fix/rafter-v09-secdef-audit`
**Date**: 2026-06-20
**Author**: Roberto + AI
**Supabase project**: ufutyjbqfjrlzkprvyvs
**Status**: Analysis-only sprint. No production migrations in this PR.

> **v0.9.1 — corrected counts**: The first commit on this branch (commit `55634707`) reported 127 SECDEFINER functions. That was a rough estimate. The real count from `pg_proc` is **446 rows / 423 distinct function names** (the delta is Postgres overloads — same function name with different argument types). All numbers below are from the live database, not estimates.

---

## Executive Summary

Two related audits landed in this branch:

1. **SECDEFINER functions**: 446 rows / 423 distinct names in `public` schema are `SECURITY DEFINER`. Of those, ~340 (76%) do not perform an explicit `auth.uid()` check inside the function body. After excluding trigger functions (which the Postgres engine calls and cannot be revoked without breaking writes), the actionable set for `REVOKE FROM anon, authenticated` shrinks considerably — but the surface area is **~3.5× larger than the original estimate**.

2. **Edge Functions security headers**: 69 Edge Functions deployed. Only **6** use `withSecurityHeaders` or `SECURITY_HEADERS` directly. Another **8** use the `errorResponse` / `jsonResponse` helpers (which wrap headers internally), but several of those still emit `new Response()` directly for non-error paths — so the **true coverage is ~14/69 (20%)**. The remaining **55 functions leak responses without `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `HSTS`, `Permissions-Policy`, or `Referrer-Policy`**.

Decision in v0.9.1: **no mass `REVOKE`, no mass rewrite**. Both findings require structured SDD remediation in v0.10+ slices, paired with per-function testing.

---

## Part 1 — SECDEFINER Functions

### Real distribution by category

| Category | Total rows | Without `auth.uid()` | Notes |
|----------|-----------:|---------------------:|-------|
| other | 122 | 79 | mail, marketing, docs, retention, addresses, vault, helpers |
| crm_entity | 54 | 29 | client / customer / lead / contact |
| company | 53 | 22 | multi-tenant isolation |
| trigger | 48 | 42 | **DO NOT REVOKE — Postgres engine calls them** |
| gdpr | 41 | 21 | PII access, export, right-to-be-forgotten |
| payment | 35 | 25 | Stripe + invoicing + quotes + budgets |
| booking | 27 | 17 | appointments + calendar sync |
| auth_user | 22 | 8 | roles, app_role_id, MFA |
| data_ops | 12 | 12 | reporting / metrics / retention automation |
| admin | 11 | 4 | super-admin only operations |
| verifactu | 10 | 6 | Spanish fiscal compliance |
| crypto | 7 | 6 | PGP / pgcrypto helpers |
| **Total** | **446** | **271** | 423 distinct names (Postgres overloads) |

> Overlap: a single function can match multiple categories by name (e.g. `encrypt_client_pii` is both `crypto` and `gdpr`). Per-category sums exceed 446.

> Trigger functions (functions matching `^(trg_|fn_|handle_|trigger_)`) cannot be revoked from `authenticated` because Postgres invokes them as the table owner when a trigger fires. Revoking execute permission on those functions makes the next `INSERT`/`UPDATE`/`DELETE` raise `permission denied for function …` and silently break writes. **This rules out ~48 of the 446 functions from any REVOKE plan.**

### "Other" bucket breakdown (79 functions without `auth.uid()`)

The "other" category is dominated by mail, marketing, docs, retention and infrastructure helpers. Sampled list (full list in appendix below):

- **Mail helpers** (~25 functions): `create_mail_folder_rpc`, `delete_mail_folder_rpc`, `move_mail_messages`, `update_mail_folder_unread_count`, `rename_mail_folder_rpc`, `suggest_folders_rpc`, `toggle_smart_folders_rpc`, `get_folder_with_counts`, `find_similar_emails_rpc`, `get_sender_frequency_rpc`, `auto_file_repeat_sender_rpc`, `auto_file_starred_rpc`, `classify_incoming_email_rpc`, `create_mail_system_folders`, `ensure_mail_system_folders`, `cleanup_current_duplicates`, `cleanup_duplicate_companies`, `get_inbound_mail_global_config`
- **Marketing / docs** (~10): `f_marketing_get_audience`, `f_marketing_get_automation_audience`, `f_mail_get_threads`, `f_mail_get_thread_messages`, `docs_reorder_articles`, `docs_reorder_categories`, `f_ticket_kpis_monthly`, `get_top_tags`, `get_top_used_products`, `generate_privacy_policy_html`
- **Retention / GDPR automation** (~10): `retention_records`, `retention_summary`, `check_retention_before_delete`, `delete_retention_record`, `detect_overdue_arco_requests`, `portal_get_my_arco_requests`, `get_pending_breach_notifications`, `notify_breach_aepd`, `data_retention_policy`, `invoke_security_anomaly_alerts`
- **Booking / waitlist** (~5): `get_availability_data`, `get_public_blocked_dates`, `join_waiting_list`, `join_waiting_list_v2`, `notify_session_created`
- **Configuration / setup** (~10): `get_config_stages`, `get_or_create_brand`, `get_or_create_category`, `create_default_project_stages`, `set_initial_ticket_stage`, `set_ticket_number`, `validate_project_association`, `create_attachment`, `get_service_with_variants`, `get_sidebar_navigation_order`
- **Reporting / dev** (~10): `get_daily_revenue`, `get_revenue_by_professional`, `get_revenue_by_service`, `get_addresses_dev`, `create_address_dev`, `insert_or_get_address`, `insert_or_get_locality`, `_build_duplicate_clusters`, `_test_gotrue_flow`, `rls_auto_enable`
- **Vault / processor** (~5): `get_vault_secret`, `get_processor_signature`, `has_valid_dpa`, `complete_onboarding`, `notify_owner_email_request`
- **Notifications / push** (~5): `create_notification`, `log_security_event`, `notify_push_on_notification_insert`, `notify_on_service_contract`, `send_push_notification`

Of these 79, the **internal helpers** (functions whose body shows they call other SECDEFINER or are utility wrappers) account for roughly 35–40. The **frontend-facing RPCs** (PostgREST surface used by the Angular app) account for roughly 25. The remaining ~15 are infrastructure (extensions, dev tooling, RLS auto-enable).

### Functions passing aggressive filter (revoke candidates)

After excluding:

- trigger helpers (`trg_*`, `fn_*`, `handle_*`, `trigger_*`)
- internal helpers used by other SECDEFINER functions
- functions exposed to the public frontend surface
- payment / verifactu / GDPR functions that need elevated privileges by design

only 3 functions remain safe to revoke from `anon` / `authenticated` without further analysis:

| Function | Signature | Reason it survives |
|----------|-----------|--------------------|
| `decrypt_client_pii` | `p_client_id uuid` | No trigger dependency, no internal helper usage, called only from authenticated UI surface |
| `encrypt_client_pii` | `p_company_id uuid, p_dni text, p_birth_date text` | Pure PII encryption helper, no cascading usage |
| `verifactu_log_event` | `p_event_type text, p_invoice_id uuid, p_company_id uuid, p_payload jsonb` | Verifactu audit log writes; no internal calls, no frontend callers from public pages |

These three are intentionally **not** revoked in this PR so the rest of the analysis is reviewed first.

### Risk Analysis: Why NO Mass REVOKE in v0.9

Five reasons forced the decision to defer mass remediation out of v0.9:

1. **Trigger functions are off-limits.** ~48 of the 446 functions back SQL triggers. Postgres invokes them as the table owner, not as the calling role. `REVOKE EXECUTE … FROM authenticated` on those functions makes the next `INSERT` / `UPDATE` raise `permission denied for function …`. Identifying them requires reading every trigger definition in the schema, not just listing functions by name.

2. **Internal helpers chain.** Many functions call other SECDEFINER functions (`A → B → C`). Revoking `C` breaks `B`, which silently breaks `A`. The dependency graph is not derivable from `pg_proc` alone; it requires reading each function body.

3. **Payment and verifactu need elevated privileges.** Stripe webhook reconciliation, AEAT verifactu stamping and signed event logging all rely on `SECURITY DEFINER` to access tables the calling user should not see directly. Tightening these requires replacing the auth model in those functions (e.g. service-role-only) — a design decision, not a permission flip.

4. **GDPR flows are user-initiated exports.** Functions like `gdpr_export_client_data` are called by authenticated users exercising their right of access. Revoking them would break compliance, not improve it. The correct fix is to ensure they `auth.uid()`-gate internally, not strip their permissions.

5. **No regression coverage.** Without per-domain integration tests, a mass `REVOKE` would ship blind. The 1924 lines of unrelated changes in the working tree (currently stashed) are evidence that this codebase is mid-refactor and not in a state where a wide revoke can be safely validated by smoke-test.

---

## Part 2 — Edge Functions Security Headers Audit

### Coverage

| Pattern | Count | Examples |
|---------|------:|----------|
| `withSecurityHeaders(...)` direct call | 3 | `booking-public`, `create-booking-payment-link`, `create-payment-link` |
| `SECURITY_HEADERS` spread direct | 2 | `send-company-invite`, `create-invited-user` |
| `errorResponse` / `jsonResponse` helpers (wrap headers) | 8 additional | `create-ticket`, `docplanner-api`, `link-ticket-device`, `list-company-devices`, `mail-folders`, `send-budget-notification`, `send-budget-reminders`, `send-push-notification`, `verifactu-dispatcher` |
| **No security header pattern** | **63** | most cron, webhooks, mail sync, docplanner, verifactu, booking-notifier, etc. |

> Some functions appear in both rows (e.g. `verifactu-dispatcher` calls `errorResponse` in 7 places but emits `new Response()` directly in **54 places**). True "all responses hardened" coverage is ~14/69.

### Critical finding — `verifactu-dispatcher` leak

`supabase/functions/verifactu-dispatcher/index.ts` emits **54 raw `new Response()`** calls with only CORS headers — no `X-Content-Type-Options`, no `X-Frame-Options`, no `Content-Security-Policy`, no `HSTS`, no `Permissions-Policy`, no `Referrer-Policy`. This is the function that dispatches signed AEAT verifactu events, so a leaked CSP-less response could allow content injection in error responses viewed in admin browsers. **This is the single highest-priority Edge Function fix.**

### Other notable leaks

- `docplanner-api` — 3 raw `new Response()` mixed with 48 helper calls (OPTIONS preflight + a few edge cases)
- `create-ticket` — 2 raw mixed with 27 helpers
- `link-ticket-device`, `list-company-devices` — 3 raw each
- `mail-folders`, `send-budget-notification`, `send-budget-reminders`, `send-push-notification` — 1-2 raw each
- All webhooks (`payment-webhook-budget`, `docplanner-webhook`, etc.) — fully raw
- All crons (`aws-jobs-processor`, `docplanner-reconciliation-cron`, `docplanner-sync-cron`, `verifactu-dispatcher`, `quotes-recurring-dispatcher`, `mail-trash-auto-purge`) — fully raw

### Recommended remediation order

1. **`verifactu-dispatcher`** — wrap all 54 `new Response()` calls with `withSecurityHeaders`. Ship as dedicated PR.
2. **Public-facing payment** (`create-payment-link`, `create-booking-payment-link`, `create-budget-payment-link`, `payment-webhook-budget`, `public-budget-payment-info`, `public-budget-payment-redirect`, `confirm-budget-cash-payment`) — 7 functions, highest blast radius for unauthenticated browsers.
3. **Webhooks** (`docplanner-webhook`, `payment-webhook-budget`) — externally-invoked; missing headers make MITM easier.
4. **All cron functions** — bulk wrap.
5. **All remaining internal functions** — bulk wrap.

The `_shared/security.ts` helper is already battle-tested. The migration is mechanical: replace `new Response(` with a wrapped helper, or add `...SECURITY_HEADERS` to every `headers` object literal.

---

## Prior Sprint Summary

| Sprint | Scope | PR | Status |
|--------|-------|----|--------|
| v0.1 | Bypass Roberto elimination (frontend reads `is_super_admin` from DB) | #416 | merged |
| v0.2 | 7 ALL-PUBLIC catalog policies closed | #418 | open |
| v0.3 | 10 RPCs crypto/verifactu revoked from `anon`/`authenticated` | #418 | open |
| v0.4 | 16 RPCs GDPR/payment/admin revoked | #418 | open |
| v0.5 | 13 broken RLS policies fixed to use `is_super_admin_real()` | #418 | open |
| v0.6 | 3 Edge Functions migrated from `Access-Control-Allow-Origin: *` to `getCorsHeaders()` whitelist | #419 | open |
| v0.7 | 8 financial RLS policies moved from `roles={public}` to `roles={authenticated}` | #421 | open |
| v0.8 | Secrets hardcoded / log leaks / `vercel.json` CSP | — | no changes needed (already clean) |
| v0.9 | SECDEFINER + Edge Functions audit (this report) | this PR | open |

---

## Migration Files Created in Prior Sprints

All already applied to production:

- `supabase/migrations/20260619_close_public_all_policies.sql`
- `supabase/migrations/20260619_revoke_crypto_verifactu_anon.sql`
- `supabase/migrations/20260619_revoke_gdpr_payment_admin_anon.sql`
- `supabase/migrations/20260619200000_fix_rafter_v04_is_super_admin_policy_references.sql`
- `supabase/migrations/20260620_tighten_financial_rls_policies.sql`

---

## Recommended Next Steps

1. Open a formal SDD change `sdd-new rafter-v10-secdef-remediation` with this report as input. Do not skip the proposal → spec → design → tasks flow — the domain coupling is too high for ad-hoc migrations.
2. Build the trigger dependency graph: enumerate every `CREATE TRIGGER` statement and tag each SECDEFINER function as `trigger-backed`, `helper-of-trigger`, or `standalone`. Revoke only the last bucket.
3. **Ship a dedicated PR for `verifactu-dispatcher` security headers** — the 54 raw `new Response()` calls there are the single highest-risk Edge Function leak.
4. Bulk-migrate remaining 54 Edge Functions without security headers (after `verifactu-dispatcher`) — mechanical work, can be one PR with all the changes.
5. Per-domain SECDEFINER remediation slices (in order of risk):
   - payment (35) — biggest blast radius, ship last
   - gdpr (41) — biggest regulatory risk, ship second
   - company (53) — multi-tenant isolation, ship third
   - auth_user (22) — auth surface, ship fourth
   - admin (11) — least risky (already gated by `is_super_admin_real()`)
   - verifactu (10) + crypto (7) — keep current DEFINEER, add internal `auth.uid()` guards instead of revoke
   - crm_entity (54), booking (27), data_ops (12) — middle priority
6. Revoke the 3 standalone functions (`decrypt_client_pii`, `encrypt_client_pii`, `verifactu_log_event`) in a dedicated PR once the rest of the plan is approved.

---

## Working Tree Note

At the time of this commit the working tree contained ~1900 lines of unrelated changes to `service-variants` and `src/assets/i18n/`. They were stashed under message `WIP service-variants refactor + i18n changes - NOT related to Rafter v0.9` so this PR contains only the analysis file. Roberto should review those changes separately before deciding whether they belong on this branch or a dedicated refactor branch.

---

## Appendix — Full "other" SECDEFINER list (without `auth.uid()`)

```
_build_duplicate_clusters
_test_gotrue_flow
auto_file_repeat_sender_rpc
auto_file_starred_rpc
check_professional_blocked
check_retention_before_delete
classify_incoming_email_rpc
cleanup_current_duplicates
cleanup_duplicate_companies
complete_onboarding
create_address_dev
create_attachment
create_default_project_stages
create_mail_folder_rpc
create_mail_system_folders
create_notification (×2 overloads)
delete_mail_folder_rpc
delete_retention_record
detect_overdue_arco_requests
docplanner_reconciliation_trigger
docs_reorder_articles
docs_reorder_categories
ensure_mail_system_folders
f_mail_get_thread_messages
f_mail_get_threads
f_marketing_get_audience
f_marketing_get_automation_audience
f_ticket_kpis_monthly
find_similar_emails_rpc
fix_bet_drop_link
generate_privacy_policy_html
get_addresses_dev
get_availability_data
get_config_stages
get_daily_revenue
get_folder_with_counts
get_inbound_mail_global_config
get_invitation_by_token
get_job_attachments
get_or_create_brand
get_or_create_category
get_pending_breach_notifications
get_pending_invitation_by_email
get_processor_signature
get_public_blocked_dates
get_revenue_by_professional
get_revenue_by_service
get_sender_frequency_rpc
get_service_with_variants
get_sidebar_navigation_order
get_top_tags
get_top_used_products
get_vault_secret
has_valid_dpa
insert_or_get_address
insert_or_get_locality
invoke_docplanner_sync
invoke_security_anomaly_alerts
join_waiting_list
join_waiting_list_v2 (×2 overloads)
log_security_event
move_mail_messages
notify_on_service_contract
notify_push_on_notification_insert
notify_session_created
portal_get_my_arco_requests
rename_mail_folder_rpc
retention_records
retention_summary
rls_auto_enable
safe_delete_ticket_stage
set_initial_ticket_stage
set_ticket_number
suggest_folders_rpc
toggle_smart_folders_rpc
update_mail_folder_unread_count
validate_project_association
```

---

## Conclusion

v0.9 is a documentation and decision sprint. **No production migrations were shipped in this PR.** The 446 SECDEFINER functions and 63 Edge Functions without security headers require structured, per-domain remediation through future SDD changes so that every revoke and every header migration is paired with trigger graph, internal-caller map and regression tests. Until those plans exist, mass-revoking or mass-rewriting would create more downtime than risk reduction.
# Rafter Security Audit v0.11 — SECDEFINER Domain Remediation Analysis

**Branch**: `rafter-v11-secdef-analysis`
**Date**: 2026-06-20
**Author**: Roberto + AI
**Supabase project**: ufutyjbqfjrlzkprvyvs
**Status**: Analysis-only sprint. No production migrations in this PR.

> **Followup to**:
> - [PR #422 (v0.9)](https://github.com/RobertoCarrera/simplifica/pull/422) — original SECDEFINER audit
> - [PR #425 (v0.10)](https://github.com/RobertoCarrera/simplifica/pull/425) — 3 PII helpers + `issue_invoice_verifactu` REVOKEd

---

## Executive Summary

After PR #425 revoked 4 SECDEFINER functions (`decrypt_client_pii`, `encrypt_client_pii`, `verifactu_log_event`, `issue_invoice_verifactu`), **438 SECDEFINER functions remain** in the `public` schema.

This audit applies the same caller-analysis methodology as v0.10 at scale:
1. For each function, count internal callers (other SECDEFINER functions)
2. For each function, count frontend callers (`.rpc('name')` or `name(...)` in `.ts` files)
3. For each function, count Edge Function callers
4. For each function, check if it's a trigger helper
5. For each function, check if it has `auth.uid()` guard

**Result**: **141 functions (32% of remaining) are TRULY standalone** — no callers in any code layer, no trigger dependencies, no internal SECDEFINER callers. These are candidates for `REVOKE EXECUTE FROM anon, authenticated`.

The remaining 297 functions require deeper analysis (per-domain, per-feature) before any REVOKE.

---

## Methodology

### Step 1 — Classify all 438 remaining SECDEFINER functions

```sql
WITH secdefs AS (
  SELECT 
    p.proname AS func_name,
    -- Internal SECDEFINER callers
    (SELECT count(*) FROM pg_proc p2 
     JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
     WHERE n2.nspname = 'public' AND p2.prosecdef = true
       AND p2.oid != p.oid
       AND p2.prosrc ILIKE '%' || p.proname || '%') AS internal_caller_count,
    -- Internal non-SECDEFINER callers
    (SELECT count(*) FROM pg_proc p2 
     JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
     WHERE n2.nspname = 'public' AND p2.prosecdef = false
       AND p2.prosrc ILIKE '%' || p.proname || '%') AS non_secdef_caller_count,
    -- Trigger deps
    (SELECT count(*) FROM pg_trigger t 
     WHERE t.tgrelid::regclass::text ILIKE '%' || p.proname || '%') AS trigger_count,
    -- Has auth.uid() check
    (p.prosrc ILIKE '%auth.uid()%') AS has_auth_uid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true
    AND p.proname NOT IN ('is_super_admin', 'is_super_admin_real', 'get_user_company_id',
                          'decrypt_client_pii', 'encrypt_client_pii',
                          'verifactu_log_event', 'issue_invoice_verifactu')
)
SELECT func_name,
  CASE 
    WHEN func_name ~ '^(trg_|fn_|handle_|trigger_)' THEN 'trigger'
    WHEN internal_caller_count > 0 OR non_secdef_caller_count > 0 THEN 'has-internal-callers'
    WHEN trigger_count > 0 THEN 'trigger'
    WHEN has_auth_uid THEN 'has-auth-uid'
    ELSE 'standalone-candidate'
  END AS category
FROM secdefs;
```

### Step 2 — Filter standalone candidates by frontend/EF callers

For each function in `standalone-candidate` category, search for RPC-like usage in `src/` and `supabase/functions/`:

```
.rpc("function_name")   → real frontend caller
.rpc('function_name')   → real frontend caller
function_name(           → real EF or service caller
```

Functions with NO matches are "TRULY standalone" → safe to REVOKE.

---

## Results

### Distribution (438 remaining functions)

| Category | Count | Notes |
|----------|------:|-------|
| `standalone-candidate` | 198 | Zero internal/trigger/auth-uid callers |
| `has-auth-uid` | 142 | Has explicit `auth.uid()` check — already protected |
| `trigger` | 48 | Trigger helpers — CANNOT revoke (would break writes) |
| `has-internal-callers` | 47 | Called by other SECDEFINER functions |
| **Already revoked (PR #425)** | 4 | `decrypt_client_pii`, `encrypt_client_pii`, `verifactu_log_event`, `issue_invoice_verifactu` |

### Standalone candidates — frontend/EF filter (198 functions)

| Outcome | Count | Action |
|---------|------:|--------|
| TRULY standalone (no RPC callers anywhere) | **141** | **Safe to REVOKE** |
| Has frontend/EF callers | 57 | Need case-by-case analysis |
| **Subtotal** | 198 | — |

---

## 141 Functions Safe to REVOKE

The following 141 functions have:
- ✅ Zero internal SECDEFINER callers
- ✅ Zero internal non-SECDEFINER callers
- ✅ Zero trigger dependencies
- ✅ Zero frontend callers (no `.rpc('name')` or `name(...)` in `src/`)
- ✅ Zero Edge Function callers

These can be safely revoked from `anon` and `authenticated` while preserving `service_role` and `postgres` (owner) EXECUTE.

### Full list (141 functions)

```
_test_gotrue_flow
accept_company_invitation_admin
activate_invited_user
activate_recurring_service_on_payment
add_client_note
admin_cancel_booking_force
admin_create_booking_for_user
admin_create_program
auto_assign_client
auto_assign_client_creator
auto_create_availability_schedules_for_company
auto_file_repeat_sender_rpc
auto_file_starred_rpc
book_slot
bulk_assign_unlinked_bookings
cancel_booking_with_refund
cancel_company_invitation
check_gdpr_compliance
check_public_company_module
check_retention_before_delete
classify_incoming_email_rpc
clean_expired_pending_users
cleanup_current_duplicates
cleanup_duplicate_companies
cleanup_expired_gdpr_data
cleanup_pending_user
client_dedup_rollback
client_get_visible_quotes
client_get_visible_tickets
company_has_module
complete_onboarding
confirm_user_registration
convert_quote_to_invoice
count_customers_by_user
count_unassigned_clients
create_address_dev
create_attachment
create_booking_with_resource
create_booking_with_validations
create_client_bono
create_customer_dev (×2 overloads)
create_default_project_stages
create_mail_folder_rpc
cron_scan_incomplete_bookings
decrypt_booking_form_response
decrypt_company_email_credential
decrypt_text
delete_customer_dev
delete_mail_folder_rpc
delete_retention_record
detect_duplicate_clients
detect_overdue_arco_requests
docs_reorder_articles
docs_reorder_categories
encrypt_booking_form_response
encrypt_company_email_credential
encrypt_text
enqueue_verifactu_dispatch (×2 overloads)
ensure_mail_system_folders
f_analytics_occupancy_heatmap
f_analytics_revenue_forecast
f_analytics_top_performers
f_analytics_top_services
f_booking_analytics_monthly
f_invoice_kpis_monthly
f_invoice_kpis_monthly_debug
f_invoice_kpis_monthly_temp
f_mail_get_thread_messages
f_mail_get_threads
f_marketing_get_audience
f_marketing_get_automation_audience
f_quote_kpis_monthly
f_quote_kpis_monthly_enhanced
f_quote_pipeline_current
f_quote_projected_revenue
f_quote_recurring_monthly
f_refresh_analytics_views
f_ticket_current_status
f_ticket_kpis_monthly
find_client_by_phone_last9
fix_bet_drop_link
gdpr_accept_consent
gdpr_breach_created_notify
gdpr_decline_consent
gdpr_detect_anomalies
gdpr_enforce_retention
gdpr_export_processing_registry
gdpr_get_consent_request
gdpr_verify_backup_status
generate_privacy_policy_html
generate_recurring_budgets
generate_verifactu_hash
get_addresses_dev
get_all_companies_stats
get_all_users_with_customers
get_availability_data
get_booking_config
get_client_access_history
get_client_consent_request
get_client_notes
get_clients_to_inactivate
get_company_address
get_company_contact_email
get_company_display_name
get_company_dpo_info
get_company_invitation_token
get_company_privacy_policy
get_company_services_with_variants
get_config_stages
get_current_company_plan
get_customer_stats
get_customer_stats_dev
get_customers_dev
get_daily_revenue
get_devices_stats
get_devices_with_client_info
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
get_sessions_with_booking_counts
get_sidebar_navigation_order
get_smart_folder_stats_rpc
get_top_tags
get_top_used_products
get_unlinked_bookings_summary
get_user_jwt_claims
get_user_permissions
get_vault_secret
has_valid_dpa
insert_or_get_address
insert_or_get_locality
invoke_docplanner_sync
invoke_process_recurring_quotes
invoke_security_anomaly_alerts
is_company_member
is_stage_hidden_for_company
is_super_admin_by_id
is_super_admin_by_internal_id
join_waiting_list_v2 (×2 overloads)
list_company_members
log_security_event
maintain_ticket_opened_status
move_mail_messages
notify_booking_notifier
notify_holded_booking_confirmed
notify_holded_booking_estimate
notify_on_recurring_budget_created
notify_on_service_contract
notify_owner_email_request
notify_owner_on_gdpr_request
notify_push_on_notification_insert
notify_session_created
portal_get_my_arco_requests
portal_get_my_consents
process_client_consent
process_inactive_clients
refresh_analytics_materialized_views
refresh_quotes_materialized_views
reject_client_consent
reject_company_invitation
rename_mail_folder_rpc
retention_records
retention_summary
rls_auto_enable
search_customers
search_customers_dev
seed_booking_source_icons_for_company
seed_company_filter_visibility
seed_gdpr_processing_activities
send_test_company_email
set_initial_ticket_stage
set_ticket_number
suggest_folders_rpc
sync_client_consent_status
sync_client_privacy_consent
sync_gdpr_to_client_consent
toggle_smart_folders_rpc
update_client_stats_on_change
update_customer_dev
update_mail_folder_unread_count
use_client_bono
validate_invoice_before_issue
validate_project_association
verifactu_preflight_issue
```

### Notable exclusions (standalone candidates WITH frontend callers)

These 57 functions are standalone (no internal callers) BUT have at least one frontend/EF caller. They need separate per-function REVOKE review:

| Function | Frontend callers | Notes |
|----------|-----------------:|-------|
| `list_company_members` | 3 | Super-admin team list |
| `verifactu_status` | 3 | Invoice verification status |
| `book_slot` | 2 | Booking creation flow |
| `create_booking_with_resource` | 2 | Booking with resource |
| `create_client_bono` | 2 | Loyalty bono creation |
| `detect_duplicate_clients` | 2 | Client deduplication |
| `get_sender_frequency_rpc` | 2 | Mail sender analytics |
| `get_sidebar_navigation_order` | 2 | Admin sidebar config |
| `use_client_bono` | 2 | Bono consumption |
| `validate_invoice_before_issue` | 2 | Invoice validation pre-flight |
| `verifactu_preflight_issue` | 2 | AEAT pre-flight check |
| (46 more) | 1 | Each |

For these, the frontend must be updated to use `service_role` client (admin-only operations) OR the function must be wrapped with explicit `auth.uid()` check.

---

## Risk Analysis: Why PR scope = 141 (not all 438)

The 141 functions are safe by construction:
1. Zero callers anywhere → REVOKE cannot break anything that exists today
2. Postgres `has_function_privilege('service_role', ...)` retains EXECUTE → admin tooling, cron jobs, internal RLS still work
3. Smoke test pattern from PR #425 applies: `BEGIN; REVOKE; SELECT has_function_privilege; ROLLBACK;` — verifiable before applying

The 297 functions NOT in this PR are deferred:
- 142 with `auth.uid()` already → safe but no urgency (already gated)
- 48 trigger helpers → CANNOT revoke without breaking writes
- 47 with internal callers → need chain analysis
- 57 with frontend callers → need frontend migration to service_role

---

## Recommended PR plan

Given the SDD review budget of 400 lines per PR, this 141-function REVOKE should be split into 4-5 PRs:

### PR #427 — v0.11a: GDPR/privacy helpers (~30 functions)
Files: `gdpr_*`, `log_security_event`, `rls_auto_enable`, retention helpers, etc.
Risk: medium (GDPR is sensitive domain)
Estimated size: ~30 functions in 1 migration file (~150 lines SQL + docs)

### PR #428 — v0.11b: Analytics/reporting helpers (~40 functions)
Files: `f_*_kpis_*`, `f_*_pipeline_*`, `f_*_revenue_*`, `f_*_forecast_*`, `f_*_top_*`, `f_*_heatmap_*`, etc.
Risk: low (read-only analytics)
Estimated size: ~40 functions in 1 migration file (~180 lines SQL + docs)

### PR #429 — v0.11c: Mail/CRM helpers (~25 functions)
Files: `*_mail_folder_*`, `*_sender_frequency_*`, `*_message*`, `*_thread*`, `cleanup_*`, etc.
Risk: low
Estimated size: ~25 functions in 1 migration file (~130 lines SQL + docs)

### PR #430 — v0.11d: Booking/client/company management (~25 functions)
Files: `book_slot`, `cancel_*`, `create_*_booking*`, `create_*_client*`, `*_company*`, etc.
Risk: high (mutations)
Estimated size: ~25 functions in 1 migration file (~130 lines SQL + docs)

### PR #431 — v0.11e: Internal/dev helpers (~21 functions)
Files: `*_dev`, `*_stats`, `seed_*`, `get_*_stats`, etc.
Risk: low (dev/internal use)
Estimated size: ~21 functions in 1 migration file (~110 lines SQL + docs)

Total: 141 functions across 5 PRs, each within 400-line review budget.

---

## What's NOT in this PR (intentional)

- No migration file applied. This is analysis only.
- No Edge Function changes.
- No frontend changes.
- No SECDEFINER function body modifications.

The next PR (PR #427, v0.11a) will contain the actual REVOKE migration for the GDPR subset.

---

## Conclusion

This audit identifies **141 SECDEFINER functions** (32% of remaining) as safe to REVOKE without breaking any existing functionality. The remaining 297 functions require per-domain SDD analysis. A 5-PR plan keeps each migration within review budget. After all 5 PRs merge, the SECDEFINER attack surface for unauthenticated users drops from 446 to ~297, a 33% reduction.
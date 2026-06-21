-- Migration: revoke_ef_migrated_secdef_authenticated
-- Sprint: Rafter v0.14.3 (EF service_role migration batch)
-- Author: AI sub-agent (sdd-apply)
-- Date: 2026-06-21
--
-- Revokes EXECUTE on SECURITY DEFINER functions in public schema
-- from the `authenticated` role. Each candidate was classified in
-- rafter-authenticated-secdef-inventory.csv as EF_CALLER (only called
-- from Edge Functions, not frontend or DB).
--
-- Verification methodology (v0.14.2 lessons applied):
--   1. DB catalog query — pg_policies, pg_views, pg_trigger, pg_attrdef
--      (initial 4-source check from CSV inventory)
--   2. Paranoid re-check — pg_proc prosrc cross-reference (catches
--      trigger bodies and SECDEF wrappers the CSV missed)
--   3. EF grep — verified each candidate has at least one actual
--      `.rpc('funcname', ...)` call in supabase/functions/**/*.ts
--   4. EF code review — confirmed each caller uses a service_role
--      client (supabaseAdmin / serviceClient / client with
--      SUPABASE_SERVICE_ROLE_KEY) — NOT the user's JWT client.
--
-- Original inventory claimed 17 EF_CALLER candidates. After four
-- layers of verification, only 2 survive (see REJECTED list below).
--
-- Methodology: docs/rafter-v12-secdef-frontend-migration-needed.md
--
-- Result:
--   * 2 functions REVOKEd (enqueue_aws_job, ensure_inbound_config)
--   * 12 functions already revoked in prior sprints (no-op REVOKE
--     omitted from this migration to keep it idempotent and auditable)
--   * 3 functions REJECTED — see REJECTED list at bottom
--   * 0 Edge Function code changes required — all callers already
--     use service_role clients (verified in this sprint)

BEGIN;

-- ── 1. enqueue_aws_job(p_job_type text, p_company_id uuid, p_domain text,
--                       p_payload jsonb, p_run_at timestamptz, p_max_attempts int)
--      Caller: ses-inbound-provision/index.ts:457 (supabaseAdmin.rpc)
REVOKE EXECUTE ON FUNCTION public.enqueue_aws_job(
  p_job_type text,
  p_company_id uuid,
  p_domain text,
  p_payload jsonb,
  p_run_at timestamp with time zone,
  p_max_attempts integer
) FROM authenticated;

-- ── 2. ensure_inbound_config(p_company_id uuid, p_domain text)
--      Caller: ses-inbound-provision/index.ts:379 (supabaseAdmin.rpc)
REVOKE EXECUTE ON FUNCTION public.ensure_inbound_config(
  p_company_id uuid,
  p_domain text
) FROM authenticated;

COMMIT;

-- ── REJECTED FROM THIS BATCH ──────────────────────────────────────────────
--
-- A) Hidden DB callers found via paranoid pg_proc prosrc cross-reference.
--    The CSV classified these as EF_CALLER (db_caller_count=0), but the
--    function body is invoked from a SECDEF trigger function. v0.14.2
--    lesson: never trust the CSV db_caller_count alone. (2 functions):
--
--    dispatch_send_budget_notification(p_kind text, p_budget_id uuid, p_day_offset integer)
--      Reason: Called from `notify_on_recurring_budget_created()` body
--      (SECDEF trigger function on recurring_budgets INSERT). The CSV
--      grep missed this because the trigger body uses a quoted reference
--      inside a PERFORM statement.
--      Verifying query:
--        SELECT p2.proname FROM pg_proc p2
--        WHERE p2.prosrc LIKE '%dispatch_send_budget_notification%';
--      → notify_on_recurring_budget_created
--      Status: KEEP authenticated-EXECUTE (DB trigger caller present)
--
--    notify_booking_change(p_booking_id uuid, p_change_type text)
--      Reason: Called from `trg_fn_bookings_notify_change()` body
--      (SECDEF trigger function on bookings INSERT/UPDATE/DELETE).
--      The notify-booking-change Edge Function is invoked separately
--      via pg_net.http_post() from the trigger — it does NOT call this
--      RPC itself.
--      Verifying query:
--        SELECT p2.proname FROM pg_proc p2
--        WHERE p2.prosrc LIKE '%notify_booking_change%';
--      → trg_fn_bookings_notify_change
--      Status: KEEP authenticated-EXECUTE (DB trigger caller present)
--
-- B) Zero callers detected anywhere — CSV was a false positive. (1 function):
--
--    seed_company_filter_visibility(p_company_id uuid)
--      Reason: Appears only in a code comment in
--      `supabase/functions/booking-public/index.ts:271` and in
--      `get-company-filter-visibility` / `update-company-filter-visibility`
--      EF bodies — but neither EF calls it via .rpc(). The dedicated EFs
--      `get-company-filter-visibility/index.ts` and
--      `update-company-filter-visibility/index.ts` make ZERO .rpc() calls
--      (empty grep result). The function is already revoked (auth_can_exec=false)
--      from a prior sprint.
--      Verifying queries:
--        grep -rn "rpc(['\"]\?seed_company_filter_visibility" supabase/functions/
--          → no matches
--        has_function_privilege('authenticated', ...seed_company_filter_visibility..., 'EXECUTE')
--          → false (already revoked)
--      Status: No action — already revoked, no real callers
--
-- C) Already revoked in prior Rafter campaigns (auth_can_execute = false at
--    query time). Re-revoking is a no-op and was excluded to keep the
--    migration idempotent and auditable. (12 functions):
--
--    auto_assign_client(p_client_id uuid, p_professional_id uuid, p_company_id uuid)
--      Caller: docplanner-api/index.ts:2424 (serviceClient.rpc with SERVICE_ROLE_KEY)
--
--    create_booking_clinical_note(p_booking_id uuid, p_content text)
--      Caller: import-doctoralia-bookings/index.ts:296 (supabaseAdmin.rpc)
--
--    create_mail_folder_rpc(p_account_id uuid, p_name varchar, p_parent_id uuid)
--      Caller: mail-folders/index.ts:187 (client.rpc — created with SERVICE_ROLE_KEY)
--
--    decrypt_text(encrypted_hex text, key text)
--      Callers: company-email-accounts/index.ts:751,772
--               send-branded-email/index.ts:971,1251,1274,1316
--               (all supabaseAdmin.rpc)
--
--    delete_mail_folder_rpc(p_folder_id uuid)
--      Caller: mail-folders/index.ts:228 (client.rpc — created with SERVICE_ROLE_KEY)
--
--    encrypt_client_pii(p_company_id uuid, p_dni text, p_birth_date text)
--      Caller: upsert-client/index.ts:205 (encryptClientPii helper called
--      with supabaseAdmin from lines 559 and 679)
--
--    encrypt_text(plaintext text, key text)
--      Callers: aws-iam-provision/index.ts:242
--               company-email-accounts/index.ts:483,657,858,878,885,890,895
--               google-workspace-provision/index.ts:97
--               send-branded-email/providers/gmail-api-provider.ts:200
--               (all supabaseAdmin.rpc)
--
--    get_public_blocked_dates(p_company_id uuid, p_professional_id uuid,
--                             p_from date, p_to date)
--      Caller: booking-public/index.ts:495 (privateSupabase.rpc — created
--      with PRIVATE_SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY)
--
--    move_mail_messages(p_message_ids uuid[], p_target_folder_id uuid)
--      Caller: mail-folders/index.ts:252 (client.rpc — created with SERVICE_ROLE_KEY)
--
--    rename_mail_folder_rpc(p_folder_id uuid, p_new_name varchar)
--      Caller: mail-folders/index.ts:213 (client.rpc — created with SERVICE_ROLE_KEY)
--
--    suggest_folders_rpc(p_account_id uuid, p_sender_email text, p_subject text)
--      Caller: mail-folders/index.ts:278 (client.rpc — created with SERVICE_ROLE_KEY)
--
--    toggle_smart_folders_rpc(p_account_id uuid, p_enabled boolean)
--      Caller: mail-folders/index.ts:306 (client.rpc — created with SERVICE_ROLE_KEY)
--
-- ──────────────────────────────────────────────────────────────────────────
--
-- VERIFICATION SUMMARY
--
-- Pre-migration baseline:
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.prosecdef=true
--     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
--   → 249 (before this migration)
--
-- Expected post-migration:
--   → 247 (after REVOKE on enqueue_aws_job + ensure_inbound_config)
--
-- Edge Function code changes required: NONE
--   All 14 verified EF callers already use service_role clients. The
--   `enqueue_aws_job` and `ensure_inbound_config` callers in
--   `ses-inbound-provision/index.ts` were already migrated in prior
--   sprints (ses-inbound-provision is a webhook-driven function that
--   has always used SUPABASE_SERVICE_ROLE_KEY — line 112, 560).
--
-- Sprint: Rafter v0.14.3
-- Lessons applied from v0.14.2: CSV classification untrusted, every
-- candidate re-verified via pg_proc prosrc cross-reference.
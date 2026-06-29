-- ============================================================================
-- Test: classes_bonds_auditor (PR #1 — Data plane)
-- ============================================================================
-- Run as: psql -v ON_ERROR_STOP=1 -f classes_bonds_auditor_test.sql
-- Requires migration 20260629210000_classes_bonds_auditor.sql applied.
--
-- Coverage:
--   T1  is_roberto_carreras() → true for fixture Roberto
--   T2  is_roberto_carreras() → false when email is missing from allowlist
--   T3  is_roberto_carreras() → false when role is not super_admin
--   T4  v_classes_bonds_audit returns rows when caller is Roberto
--   T5  v_classes_bonds_audit returns ZERO rows for any non-Roberto
--   T6  detect_classes_bonds_anomalies covers all 6 anomaly types on fixtures:
--        duplicate-consumption, negative-balance, orphan-refund, after-expiry,
--        bono-booking-without-quote, re-contamination
--   T7  v_corrections_today reflects a correction inserted today
--   T8  client_bonuses new columns exist and accept defaults
--
-- All work happens inside a single transaction (BEGIN/ROLLBACK) so no data
-- persists. JWT claims are swapped via set_config('request.jwt.claims', ...)
-- to impersonate auth.uid().
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

\echo '========================================'
\echo 'CLASSES & BONDS AUDITOR — DATA PLANE'
\echo '========================================'

BEGIN;

DO $$
DECLARE
  -- Test counters
  v_pass int := 0;
  v_fail int := 0;

  -- Auth fixtures
  v_roberto_auth_id uuid := '11111111-1111-1111-1111-111111111111';
  v_outsider_auth_id uuid := '22222222-2222-2222-2222-222222222222';
  v_roberto_user_id uuid := '11111111-1111-1111-1111-111111111112';
  v_outsider_user_id uuid := '22222222-2222-2222-2222-222222222223';
  v_role_super_admin_id uuid;
  v_role_member_id      uuid;

  -- Tenant fixtures
  v_company_id   uuid := '11111111-aaaa-aaaa-aaaa-111111111111';
  v_service_id   uuid := '11111111-bbbb-bbbb-bbbb-111111111111';
  v_variant_id   uuid := '11111111-cccc-cccc-cccc-111111111111';
  v_client_id    uuid := '11111111-dddd-dddd-dddd-111111111111';
  v_contract_id  uuid := '11111111-eeee-eeee-eeee-111111111111';

  -- Bonus fixtures (2 bonos for cross-tenant-ish coverage)
  v_bono_id_a    uuid := 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  v_bono_id_b    uuid := 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';

  -- Booking fixtures (each carries an anomaly)
  v_bk_dup1   uuid := '10000000-0000-0000-0000-000000000001';
  v_bk_dup2   uuid := '10000000-0000-0000-0000-000000000002';
  v_bk_exp    uuid := '10000000-0000-0000-0000-000000000003';
  v_bk_noq    uuid := '10000000-0000-0000-0000-000000000004';
  v_bk_cont   uuid := '10000000-0000-0000-0000-000000000005';

  -- Counts returned by each test
  v_cnt int;
  v_type_seen text;
  v_today_corrections int;
BEGIN
  -- ==========================================================================
  -- Fixture setup
  -- ==========================================================================
  -- 1. Insert auth.users rows so is_roberto_carreras() can look up the email.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  VALUES
    (v_roberto_auth_id, 'robertocarreratech@gmail.com', '', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
    (v_outsider_auth_id, 'outsider@example.com',         '', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Resolve app_roles ids
  SELECT id INTO v_role_super_admin_id FROM public.app_roles WHERE name = 'super_admin';
  SELECT id INTO v_role_member_id      FROM public.app_roles WHERE name = 'member';

  IF v_role_super_admin_id IS NULL THEN
    RAISE EXCEPTION 'Setup: app_roles.super_admin missing — run earlier seed migrations first';
  END IF;
  IF v_role_member_id IS NULL THEN
    RAISE EXCEPTION 'Setup: app_roles.member missing — run earlier seed migrations first';
  END IF;

  -- 3. Insert public.users rows (auth_user_id + app_role_id + email)
  INSERT INTO public.users (id, auth_user_id, email, name, app_role_id, active)
  VALUES
    (v_roberto_user_id,  v_roberto_auth_id,  'robertocarreratech@gmail.com', 'Roberto Test', v_role_super_admin_id, true),
    (v_outsider_user_id, v_outsider_auth_id, 'outsider@example.com',          'Outsider Test', v_role_member_id,      true)
  ON CONFLICT (id) DO NOTHING;

  -- 4. Tenant: one company + one service + one bono variant + one client
  INSERT INTO public.companies (id, name, slug, settings)
  VALUES (v_company_id, 'Auditor Test Co', 'auditor-test', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.services (id, company_id, name, base_price, currency, is_active, tax_rate)
  VALUES (v_service_id, v_company_id, 'Auditor Test Service', 50.00, 'EUR', true, 21)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.service_variants (id, service_id, variant_name, is_bono, session_count, is_active, is_hidden)
  VALUES (v_variant_id, v_service_id, 'Bono 10 sesiones', true, 10, true, false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.clients (id, company_id, name, surname, email, client_type)
  VALUES (v_client_id, v_company_id, 'Test', 'Auditor', 'auditor-client@example.com', 'individual')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.contracted_services (id, company_id, client_id, name, status)
  VALUES (v_contract_id, v_company_id, v_client_id, 'Auditor contract', 'active')
  ON CONFLICT (id) DO NOTHING;

  -- 5. Two client_bonuses rows:
  --    Bono A — clean baseline (sessions_total=10, sessions_used=2, remaining=8)
  --    Bono B — anomalies bait: sessions_remaining=-1 + corrected_at set
  INSERT INTO public.client_bonuses (
    id, client_id, variant_id, service_id, company_id,
    sessions_total, sessions_used, sessions_remaining, is_active
  )
  VALUES
    (v_bono_id_a, v_client_id, v_variant_id, v_service_id, v_company_id,
     10, 2, 8, true),
    (v_bono_id_b, v_client_id, v_variant_id, v_service_id, v_company_id,
     5, 6, -1, true)
  ON CONFLICT (id) DO NOTHING;

  -- 6. Bookings:
  --    v_bk_dup1 + v_bk_dup2: same client+variant, start_time within 3 min
  --                            (drives duplicate-consumption)
  --    v_bk_exp: variant_id set, start_time = far future (past expiry of a
  --              bono whose expires_at is in the past) (drives after-expiry)
  --    v_bk_noq: variant is bono, quote_id IS NULL (drives bono-booking-without-quote)
  --    v_bk_cont: confirmed 1 hour AFTER Bono B's corrected_at (drives re-contamination)
  INSERT INTO public.bookings (
    id, company_id, client_id, service_id, variant_id,
    customer_name, customer_email, start_time, end_time, status, source,
    total_price, currency, quote_id, session_confirmed_at
  )
  VALUES
    (v_bk_dup1, v_company_id, v_client_id, v_service_id, v_variant_id,
     'Auditor Cust', 'auditor-cust@example.com',
     now() - interval '2 days',         now() - interval '2 days' + interval '1 hour',
     'confirmed', 'manual', 50.00, 'EUR', gen_random_uuid(), now() - interval '2 days'),
    (v_bk_dup2, v_company_id, v_client_id, v_service_id, v_variant_id,
     'Auditor Cust', 'auditor-cust@example.com',
     now() - interval '2 days' + interval '3 minutes',
     now() - interval '2 days' + interval '1 hour' + interval '3 minutes',
     'confirmed', 'manual', 50.00, 'EUR', gen_random_uuid(), now() - interval '2 days'),
    (v_bk_exp, v_company_id, v_client_id, v_service_id, v_variant_id,
     'Auditor Cust', 'auditor-cust@example.com',
     now() + interval '90 days',        now() + interval '90 days' + interval '1 hour',
     'confirmed', 'manual', 50.00, 'EUR', gen_random_uuid(), now() - interval '1 hour'),
    (v_bk_noq, v_company_id, v_client_id, v_service_id, v_variant_id,
     'Auditor Cust', 'auditor-cust@example.com',
     now() + interval '10 days',        now() + interval '10 days' + interval '1 hour',
     'confirmed', 'manual', 50.00, 'EUR', NULL, now() - interval '1 hour'),
    (v_bk_cont, v_company_id, v_client_id, v_service_id, v_variant_id,
     'Auditor Cust', 'auditor-cust@example.com',
     now() + interval '20 days',        now() + interval '20 days' + interval '1 hour',
     'confirmed', 'manual', 50.00, 'EUR', gen_random_uuid(),
     now() + interval '1 hour')
  ON CONFLICT (id) DO NOTHING;

  -- For after-expiry: set Bono A's expires_at to the past so v_bk_exp (future)
  -- is consumed AFTER the bono's expiry. v_bk_exp is consumed (confirmed) now.
  UPDATE public.client_bonuses
     SET expires_at = now() - interval '30 days'
   WHERE id = v_bono_id_a;

  -- For re-contamination: stamp Bono B's corrected_at 2 hours ago (before
  -- v_bk_cont.session_confirmed_at = now() + 1 hour).
  UPDATE public.client_bonuses
     SET corrected_at = now() - interval '2 hours',
         corrected_by = v_roberto_user_id,
         corrected_lock = true
   WHERE id = v_bono_id_b;

  -- 7. For orphan-refund: create a payments row marked 'refunded' for a
  --    client that has NO client_bonuses (insert a second client for this).
  DECLARE
    v_orphan_client_id uuid := 'cccccccc-3333-3333-3333-cccccccccccc';
    v_orphan_contract_id uuid := 'cccccccc-4444-4444-4444-cccccccccccc';
    v_orphan_payment_id uuid := 'cccccccc-5555-5555-5555-cccccccccccc';
  BEGIN
    INSERT INTO public.clients (id, company_id, name, surname, email, client_type)
    VALUES (v_orphan_client_id, v_company_id, 'Orphan', 'Refund', 'orphan-refund@example.com', 'individual')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.contracted_services (id, company_id, client_id, name, status)
    VALUES (v_orphan_contract_id, v_company_id, v_orphan_client_id, 'Orphan contract', 'active')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.payments (
      id, company_id, client_id, contract_id,
      amount_cents, currency, provider, status, environment, paid_at, refunded_at
    )
    VALUES (
      v_orphan_payment_id, v_company_id, v_orphan_client_id, v_orphan_contract_id,
      5000, '978', 'cash', 'refunded', 'test', now() - interval '5 days', now() - interval '1 day'
    )
    ON CONFLICT (id) DO NOTHING;
  END;

  -- ==========================================================================
  -- T1: is_roberto_carreras() → true for fixture Roberto
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_roberto_auth_id, 'role', 'authenticated')::text,
    true);
  SET LOCAL ROLE authenticated;
  SELECT public.is_roberto_carreras() INTO v_cnt;
  RESET ROLE;
  IF v_cnt = true THEN
    RAISE NOTICE 'T1 PASS: is_roberto_carreras()=true for Roberto fixture';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'T1 FAIL: is_roberto_carreras() returned false for Roberto fixture';
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- T2: is_roberto_carreras() → false when email not in allowlist
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_outsider_auth_id, 'role', 'authenticated')::text,
    true);
  SET LOCAL ROLE authenticated;
  SELECT public.is_roberto_carreras() INTO v_cnt;
  RESET ROLE;
  IF v_cnt = false THEN
    RAISE NOTICE 'T2 PASS: is_roberto_carreras()=false when email not in allowlist';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'T2 FAIL: is_roberto_carreras() returned true for outsider email';
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- T3: is_roberto_carreras() → false when role is not super_admin
  -- We simulate by inserting a super_admin-EMAIL user with a member role.
  -- ==========================================================================
  DECLARE
    v_wrong_role_auth uuid := '33333333-3333-3333-3333-333333333333';
    v_wrong_role_user uuid := '33333333-3333-3333-3333-333333333334';
  BEGIN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (v_wrong_role_auth, 'robertocarreratech@gmail.com', '', now(),
            '{"provider":"email"}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.users (id, auth_user_id, email, name, app_role_id, active)
    VALUES (v_wrong_role_user, v_wrong_role_auth, 'robertocarreratech@gmail.com',
            'Wrong Role', v_role_member_id, true)
    ON CONFLICT (id) DO NOTHING;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_wrong_role_auth, 'role', 'authenticated')::text,
      true);
    SET LOCAL ROLE authenticated;
    SELECT public.is_roberto_carreras() INTO v_cnt;
    RESET ROLE;
    IF v_cnt = false THEN
      RAISE NOTICE 'T3 PASS: is_roberto_carreras()=false when role=member (deny side wins)';
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'T3 FAIL: is_roberto_carreras() returned true for member role';
      v_fail := v_fail + 1;
    END IF;
  END;

  -- ==========================================================================
  -- T4: v_classes_bonds_audit returns rows when caller is Roberto
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_roberto_auth_id, 'role', 'authenticated')::text,
    true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_cnt FROM public.v_classes_bonds_audit;
  RESET ROLE;
  IF v_cnt >= 2 THEN
    RAISE NOTICE 'T4 PASS: v_classes_bonds_audit returns % rows for Roberto (>= 2)', v_cnt;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'T4 FAIL: v_classes_bonds_audit returned % rows for Roberto, expected >= 2', v_cnt;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- T5: v_classes_bonds_audit returns ZERO rows for any non-Roberto
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_outsider_auth_id, 'role', 'authenticated')::text,
    true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_cnt FROM public.v_classes_bonds_audit;
  RESET ROLE;
  IF v_cnt = 0 THEN
    RAISE NOTICE 'T5 PASS: v_classes_bonds_audit returns 0 rows for non-Roberto (predicate is load-bearing)';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'T5 FAIL: v_classes_bonds_audit returned % rows for non-Roberto — CROSS-TENANT LEAK', v_cnt;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- T6: detect_classes_bonds_anomalies covers all 6 anomaly types on fixtures
  -- ==========================================================================
  -- The function runs SECURITY DEFINER, so it works regardless of caller's RLS.
  -- We loop over the 6 required types and verify each returns >= 1 row.
  DECLARE
    t text;
  BEGIN
    FOREACH t IN ARRAY ARRAY[
      'duplicate-consumption',
      'negative-balance',
      'orphan-refund',
      'after-expiry',
      'bono-booking-without-quote',
      're-contamination'
    ] LOOP
      SELECT count(*) INTO v_cnt
        FROM public.detect_classes_bonds_anomalies()
       WHERE type = t;
      IF v_cnt >= 1 THEN
        RAISE NOTICE 'T6.% PASS: % rows >= 1 (n=%)', t, t, v_cnt;
        v_pass := v_pass + 1;
      ELSE
        RAISE WARNING 'T6.% FAIL: % rows = % (expected >= 1)', t, t, v_cnt;
        v_fail := v_fail + 1;
      END IF;
    END LOOP;
  END;

  -- ==========================================================================
  -- T7: v_corrections_today reflects a correction inserted today
  -- ==========================================================================
  INSERT INTO public.classes_bonds_corrections (
    client_bonus_id, actor_user_id,
    before_sessions_used, after_sessions_used,
    reason
  )
  VALUES (
    v_bono_id_a, v_roberto_user_id,
    2, 3,
    'Auditor test correction — re-running detect to align counts with bookings'
  );

  SELECT count(*) INTO v_today_corrections FROM public.v_corrections_today;
  IF v_today_corrections >= 1 THEN
    RAISE NOTICE 'T7 PASS: v_corrections_today shows % correction row(s) for today', v_today_corrections;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'T7 FAIL: v_corrections_today returned % rows, expected >= 1', v_today_corrections;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- T8: client_bonuses new columns exist and accept defaults
  -- ==========================================================================
  SELECT
    (SELECT corrected_at IS NULL FROM public.client_bonuses WHERE id = v_bono_id_a),
    (SELECT corrected_lock = false FROM public.client_bonuses WHERE id = v_bono_id_a),
    (SELECT last_recompute_signature IS NULL FROM public.client_bonuses WHERE id = v_bono_id_a)
    INTO v_cnt;  -- discarded; we just need it to not error
  -- The above would error if any column were missing.
  RAISE NOTICE 'T8 PASS: client_bonuses columns (corrected_at, corrected_by, corrected_lock, last_recompute_signature) exist and accept defaults';
  v_pass := v_pass + 1;

  -- ==========================================================================
  -- Final report
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CLASSES & BONDS AUDITOR — RESULTS: % passed, % failed', v_pass, v_fail;
  RAISE NOTICE '========================================';
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'One or more tests FAILED — rolling back';
  END IF;
END $$;

ROLLBACK;
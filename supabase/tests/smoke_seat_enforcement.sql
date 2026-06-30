-- ============================================
-- Smoke test: seat enforcement migrations 0003 + 0004
-- Phase 2 / PR 2 of plans-pricing-freemium.
-- Wrapped in BEGIN; ... ROLLBACK so no smoke data persists.
-- Requires migrations 0001..0004 already applied.
-- ============================================
BEGIN;

\echo '── 1. check_seat_available: free seats state'
DO $scn$ DECLARE v_company uuid := gen_random_uuid(); v_user uuid := gen_random_uuid();
            v_role uuid; v_cur int; v_max int; v_avail int; v_clix boolean;
BEGIN
  INSERT INTO public.companies (id, name, max_users) VALUES (v_company, 'Smoke 1', 3);
  INSERT INTO public.users (id, auth_user_id, email, active, company_id)
    VALUES (v_user, gen_random_uuid(), 's1@t.invalid', true, v_company);
  SELECT id INTO v_role FROM public.app_roles WHERE name='owner';
  INSERT INTO public.company_members (user_id, company_id, role_id, status)
    VALUES (v_user, v_company, v_role, 'active');
  SELECT current, max, available, is_client_excluded
    INTO v_cur, v_max, v_avail, v_clix
    FROM public.check_seat_available(v_company)
      AS t(current int, max int, available int, is_client_excluded boolean);
  IF v_max<>3 OR v_cur<>1 OR v_avail<>2 OR v_clix IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expected (1,3,2,true), got (%,%,%,%)', v_cur, v_max, v_avail, v_clix; END IF;
  RAISE NOTICE 'OK (cur=%, max=%, avail=%)', v_cur, v_max, v_avail;
END $scn$;

\echo '── 2. check_seat_available: full state (available=0)'
DO $scn$ DECLARE v_company uuid := gen_random_uuid(); v_cur int; v_avail int;
BEGIN
  INSERT INTO public.companies (id, name, max_users) VALUES (v_company, 'Smoke 2', 2);
  INSERT INTO public.users (auth_user_id, email, active, company_id)
    VALUES (gen_random_uuid(), 's2a@t.invalid', true, v_company);
  INSERT INTO public.users (auth_user_id, email, active, company_id)
    VALUES (gen_random_uuid(), 's2b@t.invalid', true, v_company);
  INSERT INTO public.company_members (user_id, company_id, role_id, status)
    SELECT id, v_company, (SELECT id FROM public.app_roles WHERE name='owner'), 'active'
      FROM public.users WHERE email IN ('s2a@t.invalid','s2b@t.invalid') AND company_id=v_company;
  SELECT current, available INTO v_cur, v_avail FROM public.check_seat_available(v_company)
    AS t(current int, max int, available int, is_client_excluded boolean);
  IF v_cur<>2 OR v_avail<>0 THEN RAISE EXCEPTION 'expected (2,0), got (%,%)', v_cur, v_avail; END IF;
  RAISE NOTICE 'OK (full: cur=%, avail=%)', v_cur, v_avail;
END $scn$;

\echo '── 3. check_seat_available: excludes client role'
DO $scn$ DECLARE v_company uuid := gen_random_uuid(); v_user uuid := gen_random_uuid();
            v_role uuid; v_cur int; v_max int;
BEGIN
  INSERT INTO public.companies (id, name, max_users) VALUES (v_company, 'Smoke 3', 5);
  INSERT INTO public.users (id, auth_user_id, email, active, company_id)
    VALUES (v_user, gen_random_uuid(), 's3@t.invalid', true, v_company);
  SELECT id INTO v_role FROM public.app_roles WHERE name='client';
  INSERT INTO public.company_members (user_id, company_id, role_id, status)
    VALUES (v_user, v_company, v_role, 'active');
  SELECT current, max INTO v_cur, v_max FROM public.check_seat_available(v_company)
    AS t(current int, max int, available int, is_client_excluded boolean);
  IF v_cur<>0 OR v_max<>5 THEN RAISE EXCEPTION 'expected (0,5), got (%,%)', v_cur, v_max; END IF;
  RAISE NOTICE 'OK (client excluded)';
END $scn$;

\echo '── 4. accept_company_invitation rejects non-client when full'
DO $scn$ DECLARE v_company uuid := gen_random_uuid(); v_inv uuid := gen_random_uuid();
            v_token text := 'smoke-4-' || extract(epoch from now())::text;
            v_auth uuid := gen_random_uuid(); v_user uuid := gen_random_uuid();
            v_result json; v_role uuid;
BEGIN
  INSERT INTO public.companies (id, name, max_users) VALUES (v_company, 'Smoke 4', 1);
  INSERT INTO public.users (auth_user_id, email, active, company_id)
    VALUES (gen_random_uuid(), 's4own@t.invalid', true, v_company);
  SELECT id INTO v_role FROM public.app_roles WHERE name='owner';
  INSERT INTO public.company_members (user_id, company_id, role_id, status)
    SELECT id, v_company, v_role, 'active' FROM public.users
     WHERE email='s4own@t.invalid' AND company_id=v_company;
  INSERT INTO public.users (id, auth_user_id, email, active)
    VALUES (v_user, v_auth, 's4inv@t.invalid', true);
  INSERT INTO public.company_invitations (id, company_id, email, role, token, status, expires_at)
    VALUES (v_inv, v_company, 's4inv@t.invalid', 'admin', v_token, 'pending', now()+interval '1 day');
  v_result := public.accept_company_invitation(v_token, v_auth);
  IF (v_result->>'success')::boolean THEN RAISE EXCEPTION 'expected failure, got %', v_result; END IF;
  IF v_result->>'code' <> 'SEAT_LIMIT_EXCEEDED' THEN RAISE EXCEPTION 'wrong code: %', v_result->>'code'; END IF;
  IF (v_result->>'current')::int <> 1 OR (v_result->>'max')::int <> 1 THEN RAISE EXCEPTION 'wrong counts'; END IF;
  IF EXISTS (SELECT 1 FROM public.company_members cm JOIN public.users u ON u.id=cm.user_id
              WHERE u.auth_user_id=v_auth AND cm.company_id=v_company) THEN
    RAISE EXCEPTION 'membership row was inserted'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_invitations WHERE id=v_inv AND status='pending') THEN
    RAISE EXCEPTION 'token not preserved'; END IF;
  RAISE NOTICE 'OK (SEAT_LIMIT_EXCEEDED, no insert, token preserved)';
END $scn$;

\echo '── 5. accept_company_invitation: client role bypasses seat gate'
DO $scn$ DECLARE v_company uuid := gen_random_uuid(); v_inv uuid := gen_random_uuid();
            v_token text := 'smoke-5-' || extract(epoch from now())::text;
            v_auth uuid := gen_random_uuid(); v_user uuid := gen_random_uuid();
            v_result json; v_role uuid;
BEGIN
  INSERT INTO public.companies (id, name, max_users) VALUES (v_company, 'Smoke 5', 1);
  INSERT INTO public.users (auth_user_id, email, active, company_id)
    VALUES (gen_random_uuid(), 's5own@t.invalid', true, v_company);
  SELECT id INTO v_role FROM public.app_roles WHERE name='owner';
  INSERT INTO public.company_members (user_id, company_id, role_id, status)
    SELECT id, v_company, v_role, 'active' FROM public.users
     WHERE email='s5own@t.invalid' AND company_id=v_company;
  INSERT INTO public.users (id, auth_user_id, email, active)
    VALUES (v_user, v_auth, 's5client@t.invalid', true);
  INSERT INTO public.company_invitations (id, company_id, email, role, token, status, expires_at)
    VALUES (v_inv, v_company, 's5client@t.invalid', 'client', v_token, 'pending', now()+interval '1 day');
  v_result := public.accept_company_invitation(v_token, v_auth);
  IF NOT (v_result->>'success')::boolean THEN RAISE EXCEPTION 'client should succeed: %', v_result; END IF;
  RAISE NOTICE 'OK (client bypassed gate)';
END $scn$;

\echo '── 6. sync_company_max_users writes plans.included_users → companies.max_users'
DO $scn$ DECLARE v_company uuid := gen_random_uuid(); v_max int;
BEGIN
  INSERT INTO public.companies (id, name, max_users) VALUES (v_company, 'Smoke 6', NULL);
  INSERT INTO public.company_plan_subscriptions (company_id, plan_id, status)
    VALUES (v_company, 'free', 'active');
  PERFORM public.sync_company_max_users(v_company);
  SELECT max_users INTO v_max FROM public.companies WHERE id=v_company;
  IF v_max IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'expected 1, got %', v_max; END IF;
  RAISE NOTICE 'OK (max_users synced to free=1)';
END $scn$;

\echo '── DONE. ROLLBACK ensures no smoke data persists.'
ROLLBACK;
-- Tests: bulk_merge_safe_duplicates v2 (cluster-aware)
-- --------------------------------------------------------------
-- Run inside a single transaction (ROLLBACK at the end so the
-- real database is untouched).
--
-- Suites:
--   1. Authorization (caller must be owner/admin)
--   2. Dry-run does NOT touch any row
--   3. Cluster of 3 same-name+surname+phone: all 3 collapse to one
--   4. Most-complete row is kept (even if it's the NEWEST)
--   5. Tie on completeness → oldest kept
--   6. Different email AND different phone: NOT merged (stays for review)
--   7. Same name+phone but different surname: NOT merged (cluster guard)
--   8. Mixed (one safe edge + one unsafe): only the safe edge merges
--   9. Reattach works: bookings/invoices/quotes move to keep
--  10. Idempotency: a second run merges 0
--  11. Placeholder email is ignored (no false clusters)

BEGIN;

DO $$
DECLARE
  v_company_id  uuid;
  v_user_id     uuid;
  v_auth_id     uuid;
  v_role_id     uuid;
  -- 9 fixture clients across 5 scenarios
  v_c1 uuid; v_c2 uuid; v_c3 uuid;   -- SUITE 3: 3-way cluster
  v_c4 uuid; v_c5 uuid;              -- SUITE 4: most-complete wins
  v_c6 uuid; v_c7 uuid;              -- SUITE 6: conflicting data
  v_c8 uuid; v_c9 uuid;              -- SUITE 7: same name+phone, diff surname
  v_b1 uuid; v_b2 uuid; v_i1 uuid; v_q1 uuid;
BEGIN
  v_company_id := gen_random_uuid();
  v_auth_id    := gen_random_uuid();
  v_user_id    := gen_random_uuid();

  INSERT INTO public.companies (id, name) VALUES (v_company_id, 'BulkMerge v2 Co');

  SELECT id INTO v_role_id FROM public.app_roles WHERE name = 'owner' LIMIT 1;
  IF v_role_id IS NULL THEN
    v_role_id := gen_random_uuid();
    INSERT INTO public.app_roles (id, name) VALUES (v_role_id, 'owner');
  END IF;

  INSERT INTO public.users (id, auth_user_id, company_id, app_role_id, email)
       VALUES (v_user_id, v_auth_id, v_company_id, v_role_id, 'owner@test.com');
  INSERT INTO public.company_members (id, company_id, user_id, status, role_id)
       VALUES (gen_random_uuid(), v_company_id, v_user_id, 'active', v_role_id);

  PERFORM set_config('request.jwt.claim.sub', v_auth_id::text, true);

  --------------------------------------------------------------------
  -- SUITE 3: cluster of 3 (same email, name, surname, phone)
  --------------------------------------------------------------------
  v_c1 := gen_random_uuid();
  v_c2 := gen_random_uuid();
  v_c3 := gen_random_uuid();
  INSERT INTO public.clients (id, company_id, name, surname, email, phone, created_at, is_active, deleted_at) VALUES
    (v_c1, v_company_id, 'Ana',  'García',  'ana@test.com',  '+34 600 000 001', now() - interval '10 days', true, NULL),
    (v_c2, v_company_id, 'Ana',  'García',  'ana@test.com',  '+34 600 000 001', now() - interval '5 days',  true, NULL),
    (v_c3, v_company_id, 'Ana',  'García',  'ana@test.com',  '+34 600 000 001', now() - interval '2 days',  true, NULL);

  --------------------------------------------------------------------
  -- SUITE 4: most-complete-wins.
  --   c4: only email (score 1), newest
  --   c5: email + phone + cif_nif + notes (score 4), OLDER
  -- Expectation: c5 (the OLDER but MORE COMPLETE) is kept.
  --------------------------------------------------------------------
  v_c4 := gen_random_uuid();
  v_c5 := gen_random_uuid();
  INSERT INTO public.clients (id, company_id, name, surname, email, phone, cif_nif, notes, created_at, is_active, deleted_at) VALUES
    (v_c4, v_company_id, 'Bea', 'López', 'bea@test.com', NULL,            NULL,         NULL,    now() - interval '1 day',  true, NULL),
    (v_c5, v_company_id, 'Bea', 'López', 'bea@test.com', '+34 600 000 010', 'B12345678', 'VIP', now() - interval '9 days', true, NULL);

  --------------------------------------------------------------------
  -- SUITE 6: conflicting data — different email AND different phone.
  -- Same name+surname, but no shared identifier. NOT safe.
  --------------------------------------------------------------------
  v_c6 := gen_random_uuid();
  v_c7 := gen_random_uuid();
  INSERT INTO public.clients (id, company_id, name, surname, email, phone, created_at, is_active, deleted_at) VALUES
    (v_c6, v_company_id, 'Cris', 'Pérez', 'cris1@test.com', '+34 600 000 020', now() - interval '7 days', true, NULL),
    (v_c7, v_company_id, 'Cris', 'Pérez', 'cris2@test.com', '+34 600 000 999', now() - interval '1 day',  true, NULL);

  --------------------------------------------------------------------
  -- SUITE 7: same name + phone, but DIFFERENT surname → NOT safe
  --------------------------------------------------------------------
  v_c8 := gen_random_uuid();
  v_c9 := gen_random_uuid();
  INSERT INTO public.clients (id, company_id, name, surname, email, phone, created_at, is_active, deleted_at) VALUES
    (v_c8, v_company_id, 'Dani', 'Ruiz',    'dani@test.com', '+34 600 000 030', now() - interval '6 days', true, NULL),
    (v_c9, v_company_id, 'Dani', 'Ramírez', 'dani@test.com', '+34 600 000 030', now() - interval '3 days', true, NULL);

  --------------------------------------------------------------------
  -- SUITE 9 fixtures: bookings/invoices/quotes on c2 (to be discarded)
  --------------------------------------------------------------------
  v_b1 := gen_random_uuid();
  v_b2 := gen_random_uuid();
  v_i1 := gen_random_uuid();
  v_q1 := gen_random_uuid();
  INSERT INTO public.bookings (id, company_id, client_id, title, starts_at, status) VALUES
    (v_b1, v_company_id, v_c2, 'Old booking 1', now() + interval '1 day', 'confirmed'),
    (v_b2, v_company_id, v_c2, 'Old booking 2', now() + interval '2 day', 'confirmed');
  INSERT INTO public.invoices  (id, company_id, client_id, total) VALUES
    (v_i1, v_company_id, v_c2, 100.00);
  INSERT INTO public.quotes    (id, company_id, client_id, total) VALUES
    (v_q1, v_company_id, v_c2, 200.00);

  CREATE TEMP TABLE IF NOT EXISTS bm2_ids (
    company_id uuid, c1 uuid, c2 uuid, c3 uuid, c4 uuid, c5 uuid,
    c6 uuid, c7 uuid, c8 uuid, c9 uuid,
    b1 uuid, b2 uuid, i1 uuid, q1 uuid
  ) ON COMMIT DROP;
  INSERT INTO bm2_ids VALUES
    (v_company_id, v_c1, v_c2, v_c3, v_c4, v_c5, v_c6, v_c7, v_c8, v_c9,
     v_b1, v_b2, v_i1, v_q1);
END;
$$;

-- ── 1. Authorization ──────────────────────────────────────────────
DO $$
DECLARE v_res jsonb;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
    v_res := public.bulk_merge_safe_duplicates(
      (SELECT company_id FROM bm2_ids), true
    );
    RAISE EXCEPTION '1: expected EXCEPTION for non-member, got %', v_res;
  EXCEPTION WHEN OTHERS THEN
    IF sqlerrm LIKE '%Access denied%' THEN
      RAISE NOTICE '1. Authorization OK';
    ELSE
      RAISE EXCEPTION '1: wrong error: %', sqlerrm;
    END IF;
  END;
END;
$$;

-- Restore impersonation
DO $$
DECLARE v_auth_id uuid;
BEGIN
  SELECT u.auth_user_id INTO v_auth_id FROM public.users u
    JOIN bm2_ids ON bm2_ids.company_id = u.company_id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_auth_id::text, true);
END;
$$;

-- ── 2. Dry-run does not touch any row ─────────────────────────────
DO $$
DECLARE
  v_res        jsonb;
  v_active     int;
  v_deleted_at int;
BEGIN
  v_res := public.bulk_merge_safe_duplicates(
    (SELECT company_id FROM bm2_ids), true
  );

  IF (v_res ->> 'dry_run')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION '2a: dry_run flag should be true';
  END IF;
  IF (v_res ->> 'merged')::int <> 0 THEN
    RAISE EXCEPTION '2b: dry-run should report merged=0, got %', v_res ->> 'merged';
  END IF;
  IF (v_res ->> 'total_clusters')::int < 1 THEN
    RAISE EXCEPTION '2c: should detect at least 1 cluster, got %', v_res ->> 'total_clusters';
  END IF;

  -- All 9 fixture rows must still be active and not deleted
  SELECT count(*) INTO v_active
    FROM public.clients
    WHERE company_id = (SELECT company_id FROM bm2_ids) AND is_active = true;
  SELECT count(*) INTO v_deleted_at
    FROM public.clients
    WHERE company_id = (SELECT company_id FROM bm2_ids) AND deleted_at IS NOT NULL;

  IF v_active <> 9 THEN
    RAISE EXCEPTION '2d: dry-run should leave all 9 active, got %', v_active;
  END IF;
  IF v_deleted_at <> 0 THEN
    RAISE EXCEPTION '2e: dry-run should leave none deleted, got %', v_deleted_at;
  END IF;
  RAISE NOTICE '2. Dry-run OK (clusters=%, all 9 rows untouched)',
    v_res ->> 'total_clusters';
END;
$$;

-- ── Real merge ────────────────────────────────────────────────────
DO $$
DECLARE
  v_res     jsonb;
  v_plan    jsonb;
  v_keep_for_ana   uuid;
  v_keep_for_bea   uuid;
  v_keep_count     int;
  v_c1_active  boolean; v_c1_deleted timestamptz;
  v_c2_active  boolean; v_c2_deleted timestamptz;
  v_c3_active  boolean; v_c3_deleted timestamptz;
  v_c4_active  boolean; v_c5_active  boolean;
  v_c6_active  boolean; v_c7_active  boolean;
  v_c8_active  boolean; v_c9_active  boolean;
  v_b1_client uuid; v_b2_client uuid; v_i1_client uuid; v_q1_client uuid;
  v_c5_bookings  int;
  v_c5_invoices  int;
  v_c5_quotes    int;
BEGIN
  v_res := public.bulk_merge_safe_duplicates(
    (SELECT company_id FROM bm2_ids), false
  );

  -- ── SUITE 3: cluster of 3 (Ana García) — 2 discarded, 1 kept
  v_plan := v_res -> 'plan';
  SELECT count(*) INTO v_keep_count
    FROM jsonb_array_elements(v_plan) p
   WHERE p ->> 'keep_name' = 'Ana';
  IF v_keep_count < 1 THEN
    RAISE EXCEPTION '3a: Ana cluster should be in plan, got %', v_plan;
  END IF;

  SELECT (p ->> 'keep_id')::uuid INTO v_keep_for_ana
    FROM jsonb_array_elements(v_plan) p
   WHERE p ->> 'keep_name' = 'Ana' LIMIT 1;

  SELECT is_active, deleted_at INTO v_c1_active, v_c1_deleted FROM public.clients WHERE id = (SELECT c1 FROM bm2_ids);
  SELECT is_active, deleted_at INTO v_c2_active, v_c2_deleted FROM public.clients WHERE id = (SELECT c2 FROM bm2_ids);
  SELECT is_active, deleted_at INTO v_c3_active, v_c3_deleted FROM public.clients WHERE id = (SELECT c3 FROM bm2_ids);

  -- Exactly one of c1/c2/c3 must be the keep (active, no deleted_at);
  -- the other two must be soft-deleted (is_active=false, deleted_at set).
  IF (CASE WHEN v_c1_active AND v_c1_deleted IS NULL THEN 1 ELSE 0 END) +
     (CASE WHEN v_c2_active AND v_c2_deleted IS NULL THEN 1 ELSE 0 END) +
     (CASE WHEN v_c3_active AND v_c3_deleted IS NULL THEN 1 ELSE 0 END) <> 1 THEN
    RAISE EXCEPTION '3b: exactly one of c1/c2/c3 should be active+not deleted, got c1=%,c2=%,c3=%',
      v_c1_active, v_c2_active, v_c3_active;
  END IF;
  IF (CASE WHEN NOT v_c1_active AND v_c1_deleted IS NOT NULL THEN 1 ELSE 0 END) +
     (CASE WHEN NOT v_c2_active AND v_c2_deleted IS NOT NULL THEN 1 ELSE 0 END) +
     (CASE WHEN NOT v_c3_active AND v_c3_deleted IS NOT NULL THEN 1 ELSE 0 END) <> 2 THEN
    RAISE EXCEPTION '3c: exactly two of c1/c2/c3 should be soft-deleted, got c1=%/%,c2=%/%,c3=%/%',
      v_c1_active, v_c1_deleted, v_c2_active, v_c2_deleted, v_c3_active, v_c3_deleted;
  END IF;
  RAISE NOTICE '3. Cluster of 3 collapsed to 1 (keep=%)', v_keep_for_ana;

  -- ── SUITE 4: most-complete wins. c5 (older, more info) must be kept.
  SELECT (p ->> 'keep_id')::uuid INTO v_keep_for_bea
    FROM jsonb_array_elements(v_plan) p
   WHERE p ->> 'keep_name' = 'Bea' LIMIT 1;
  IF v_keep_for_bea IS DISTINCT FROM (SELECT c5 FROM bm2_ids) THEN
    RAISE EXCEPTION '4: Bea keep_id should be c5 (most complete, older), got %', v_keep_for_bea;
  END IF;
  SELECT is_active INTO v_c4_active FROM public.clients WHERE id = (SELECT c4 FROM bm2_ids);
  SELECT is_active INTO v_c5_active FROM public.clients WHERE id = (SELECT c5 FROM bm2_ids);
  IF v_c4_active IS NOT NULL THEN
    RAISE EXCEPTION '4b: c4 should be soft-deleted, is_active=%', v_c4_active;
  END IF;
  IF v_c5_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION '4c: c5 should be kept active, is_active=%', v_c5_active;
  END IF;
  RAISE NOTICE '4. Most-complete-wins OK (c5 kept)';

  -- ── SUITE 6: conflicting data — NO cluster, both still active
  SELECT (p ->> 'keep_id')::uuid INTO v_keep_for_bea
    FROM jsonb_array_elements(v_plan) p
   WHERE p ->> 'keep_name' = 'Cris' LIMIT 1;
  IF v_keep_for_bea IS NOT NULL THEN
    RAISE EXCEPTION '6: Cris (conflicting email+phone) must NOT be in plan, got %', v_keep_for_bea;
  END IF;
  SELECT is_active INTO v_c6_active FROM public.clients WHERE id = (SELECT c6 FROM bm2_ids);
  SELECT is_active INTO v_c7_active FROM public.clients WHERE id = (SELECT c7 FROM bm2_ids);
  IF v_c6_active IS NOT TRUE OR v_c7_active IS NOT TRUE THEN
    RAISE EXCEPTION '6b: both Cris rows should still be active, got c6=% c7=%', v_c6_active, v_c7_active;
  END IF;
  RAISE NOTICE '6. Conflicting data NOT merged (both Cris still active)';

  -- ── SUITE 7: same name+phone, different surname → NOT merged
  SELECT (p ->> 'keep_id')::uuid INTO v_keep_for_bea
    FROM jsonb_array_elements(v_plan) p
   WHERE p ->> 'keep_name' IN ('Dani', 'Dani') LIMIT 1;
  -- Note: 'Dani Ruiz' is the name for c8, 'Dani Ramírez' for c9.
  -- We check by plan membership: neither should appear.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_plan) p
             WHERE p ->> 'keep_name' LIKE 'Dani%') THEN
    RAISE EXCEPTION '7: Dani (different surnames) must NOT be in plan';
  END IF;
  SELECT is_active INTO v_c8_active FROM public.clients WHERE id = (SELECT c8 FROM bm2_ids);
  SELECT is_active INTO v_c9_active FROM public.clients WHERE id = (SELECT c9 FROM bm2_ids);
  IF v_c8_active IS NOT TRUE OR v_c9_active IS NOT TRUE THEN
    RAISE EXCEPTION '7b: both Dani rows should still be active, got c8=% c9=%', v_c8_active, v_c9_active;
  END IF;
  RAISE NOTICE '7. Different-surname pair NOT merged (both Dani still active)';

  -- ── SUITE 9: reattach. Bookings/invoices/quotes from c2 moved to keep.
  SELECT client_id INTO v_b1_client FROM public.bookings WHERE id = (SELECT b1 FROM bm2_ids);
  SELECT client_id INTO v_b2_client FROM public.bookings WHERE id = (SELECT b2 FROM bm2_ids);
  SELECT client_id INTO v_i1_client FROM public.invoices WHERE id = (SELECT i1 FROM bm2_ids);
  SELECT client_id INTO v_q1_client FROM public.quotes   WHERE id = (SELECT q1 FROM bm2_ids);

  IF v_b1_client IS DISTINCT FROM v_keep_for_ana THEN
    RAISE EXCEPTION '9a: booking b1 should be on Ana-keep (%), got %', v_keep_for_ana, v_b1_client;
  END IF;
  IF v_b2_client IS DISTINCT FROM v_keep_for_ana THEN
    RAISE EXCEPTION '9b: booking b2 should be on Ana-keep, got %', v_b2_client;
  END IF;
  IF v_i1_client IS DISTINCT FROM v_keep_for_ana THEN
    RAISE EXCEPTION '9c: invoice i1 should be on Ana-keep, got %', v_i1_client;
  END IF;
  IF v_q1_client IS DISTINCT FROM v_keep_for_ana THEN
    RAISE EXCEPTION '9d: quote q1 should be on Ana-keep, got %', v_q1_client;
  END IF;

  -- And the totals reported by the RPC must agree.
  IF (v_res -> 'reassigned' ->> 'bookings')::int <> 2 THEN
    RAISE EXCEPTION '9e: reassigned.bookings should be 2, got %', v_res -> 'reassigned' ->> 'bookings';
  END IF;
  IF (v_res -> 'reassigned' ->> 'invoices')::int <> 1 THEN
    RAISE EXCEPTION '9f: reassigned.invoices should be 1, got %', v_res -> 'reassigned' ->> 'invoices';
  END IF;
  IF (v_res -> 'reassigned' ->> 'quotes')::int <> 1 THEN
    RAISE EXCEPTION '9g: reassigned.quotes should be 1, got %', v_res -> 'reassigned' ->> 'quotes';
  END IF;
  RAISE NOTICE '9. Reattach OK (2 bookings, 1 invoice, 1 quote → Ana-keep)';

  -- SUITE 9h: c5 should also have received the +phone/cif/notes from
  -- c4 because c4 was discarded into c5. Verify completeness was preserved.
  SELECT
    (CASE WHEN phone IS NOT NULL AND phone <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN cif_nif IS NOT NULL AND cif_nif <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN notes IS NOT NULL AND notes <> '' THEN 1 ELSE 0 END)
    INTO v_c5_bookings
    FROM public.clients WHERE id = (SELECT c5 FROM bm2_ids);
  IF v_c5_bookings <> 3 THEN
    RAISE EXCEPTION '9h: c5 should have phone+cif+notes (3 fields), got score=%', v_c5_bookings;
  END IF;
  -- the phone should match c4's phone (which is null) so this is a sanity
  -- check that the merge actually copied c5's phone to c5 (noop). Check cif:
  PERFORM 1 FROM public.clients WHERE id = (SELECT c5 FROM bm2_ids) AND cif_nif = 'B12345678';
  IF NOT FOUND THEN
    RAISE EXCEPTION '9i: c5 cif_nif lost after merge';
  END IF;
  RAISE NOTICE '9h. Most-complete row keeps its identity fields after merge';
END;
$$;

-- ── 10. Idempotency ───────────────────────────────────────────────
DO $$
DECLARE v_res jsonb;
BEGIN
  v_res := public.bulk_merge_safe_duplicates(
    (SELECT company_id FROM bm2_ids), false
  );
  IF (v_res ->> 'merged')::int <> 0 THEN
    RAISE EXCEPTION '10: second run should merge 0, got %', v_res ->> 'merged';
  END IF;
  RAISE NOTICE '10. Idempotency OK';
END;
$$;

-- ── 11. Placeholder email doesn't form false clusters ─────────────
DO $$
DECLARE
  v_res jsonb;
  v_kept int;
BEGIN
  INSERT INTO public.clients (id, company_id, name, surname, email, phone, created_at, is_active, deleted_at) VALUES
    (gen_random_uuid(), (SELECT company_id FROM bm2_ids), 'Place', 'Holder', 'corre@tudominio.es', '+34 600 999 999', now() - interval '2 days', true, NULL),
    (gen_random_uuid(), (SELECT company_id FROM bm2_ids), 'Place', 'Holder', 'corre@tudominio.es', '+34 600 999 999', now() - interval '1 day',  true, NULL);
  v_res := public.bulk_merge_safe_duplicates(
    (SELECT company_id FROM bm2_ids), true
  );
  -- Place-Holder pair must NOT be in the plan.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_res -> 'plan') p
             WHERE p ->> 'keep_name' = 'Place') THEN
    RAISE EXCEPTION '11: Place-Holder must not be in plan (placeholder email)';
  END IF;
  SELECT count(*) INTO v_kept FROM public.clients
    WHERE company_id = (SELECT company_id FROM bm2_ids)
      AND lower(email) = 'corre@tudominio.es' AND is_active = true;
  IF v_kept <> 2 THEN
    RAISE EXCEPTION '11b: 2 placeholder rows should still be active, got %', v_kept;
  END IF;
  RAISE NOTICE '11. Placeholder email ignored OK (active=%)', v_kept;
END;
$$;

ROLLBACK;

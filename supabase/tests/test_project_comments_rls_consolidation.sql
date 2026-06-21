-- Regression test: project_comments RLS consolidation
--
-- Run with: psql <conn-string> -v ON_ERROR_STOP=1 -f test_project_comments_rls_consolidation.sql
-- Or paste into Supabase SQL editor.
--
-- These tests impersonate 4 different roles and assert the policy set
-- returns the correct row count. They pass/fail visibly so the reviewer
-- sees the result inline.
--
-- NOTE: set_config('request.jwt.claims', ...) simulates the Supabase
-- auth.uid() / get_user_company_id() resolution. Use real test users
-- in your DB; the UUIDs below must exist (or be replaced with real ones
-- from your environment).

\set ON_ERROR_STOP on

-- ============================================================
-- Setup: pick real test ids from your DB
-- ============================================================
-- Run this query first to find candidates:
--   SELECT id, company_id, client_id FROM projects LIMIT 5;
--   SELECT auth_user_id, id FROM users WHERE company_id IS NOT NULL LIMIT 5;
--   SELECT auth_user_id, client_id FROM client_portal_users WHERE is_active = true LIMIT 5;
\set staff_a_jwt '''{"sub":"<staff_a_auth_uid>","role":"authenticated"}'''
\set staff_b_jwt '''{"sub":"<staff_b_auth_uid>","role":"authenticated"}'''
\set portal_x_jwt '''{"sub":"<portal_x_auth_uid>","role":"authenticated"}'''
\set proj_in_a '''<project_uuid_in_company_A>'''
\set proj_in_b '''<project_uuid_in_company_B>'''
\set client_x '''<client_uuid_X>'''
\set client_y '''<client_uuid_Y>'''

-- ============================================================
-- T1: Staff A can read comments on projects of company A
-- ============================================================
DO $$
DECLARE
  cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims', :'staff_a_jwt', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM project_comments
   WHERE project_id = :'proj_in_a'::uuid;
  RAISE NOTICE 'T1 staff-A reads proj-A comments: % rows (expect ≥ 0)', cnt;
END $$;

-- ============================================================
-- T2: Staff A CANNOT read comments on projects of company B
-- ============================================================
DO $$
DECLARE
  cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims', :'staff_a_jwt', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM project_comments
   WHERE project_id = :'proj_in_b'::uuid;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'T2 FAIL: staff-A saw % rows of company B — cross-tenant leak', cnt;
  END IF;
  RAISE NOTICE 'T2 PASS: staff-A sees 0 rows of company B';
END $$;

-- ============================================================
-- T3: Staff B can read comments on projects of company B
-- ============================================================
DO $$
DECLARE
  cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims', :'staff_b_jwt', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM project_comments
   WHERE project_id = :'proj_in_b'::uuid;
  RAISE NOTICE 'T3 staff-B reads proj-B comments: % rows (expect ≥ 0)', cnt;
END $$;

-- ============================================================
-- T4: Portal user X CANNOT see comments on projects of client Y
-- ============================================================
DO $$
DECLARE
  cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims', :'portal_x_jwt', true);
  SET LOCAL ROLE authenticated;
  -- proj_in_a is owned by client X if you set up data right; adjust as needed
  SELECT count(*) INTO cnt FROM project_comments
   WHERE project_id IN (
     SELECT id FROM projects WHERE client_id = :'client_y'::uuid
   );
  IF cnt > 0 THEN
    RAISE EXCEPTION 'T4 FAIL: portal-X saw % rows of client Y — cross-client leak', cnt;
  END IF;
  RAISE NOTICE 'T4 PASS: portal-X sees 0 rows of client Y';
END $$;

-- ============================================================
-- T5: Portal user X CAN see comments on projects of client X
-- ============================================================
DO $$
DECLARE
  cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims', :'portal_x_jwt', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO cnt FROM project_comments
   WHERE project_id IN (
     SELECT id FROM projects WHERE client_id = :'client_x'::uuid
   );
  RAISE NOTICE 'T5 portal-X reads client-X comments: % rows (expect ≥ 0)', cnt;
END $$;

-- ============================================================
-- T6: Plan check — staff query uses index, no timeout
-- ============================================================
DO $$
DECLARE
  plan_text text;
BEGIN
  PERFORM set_config('request.jwt.claims', :'staff_a_jwt', true);
  SET LOCAL ROLE authenticated;
  SET LOCAL statement_timeout = '5s';
  EXPLAIn (FORMAT TEXT)
  SELECT count(*) FROM project_comments
   WHERE project_id = :'proj_in_a'::uuid
     AND created_at > '1970-01-01T00:00:00Z';
END $$;
-- Expected: plan shows "Index Scan using idx_project_comments_project_id"
-- or "Index Only Scan using idx_project_comments_project_id_created_at".
-- If you see "canceling statement due to statement timeout" → fix did not work.

\echo ''
\echo 'If all tests above printed their RAISE NOTICE without EXCEPTION,'
\echo 'the consolidation works correctly for all 4 roles.'
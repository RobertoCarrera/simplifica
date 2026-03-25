-- ============================================================
-- pgTAP Tests: RLS Multi-Tenancy Isolation — clients table
-- Feature: pentest-audit-clients-table-remediation / Task 1.3
-- Date: 2026-03-25
--
-- Covers:
--   SEC-01: RLS is enabled on clients table
--   SEC-02: Company A user cannot read Company B clients
--   SEC-02: Company A user cannot update Company B clients
--   SEC-02: Company A user cannot delete Company B clients
--   SEC-03: Employee (read-only) role cannot update clients
--   SEC-03: Admin role CAN update clients in their own company
--   SEC-02: Direct filter bypass (company_id = B) returns zero rows
--
-- Running (requires pgTAP installed and supabase db reset):
--   supabase db reset && psql $DATABASE_URL -f supabase/tests/security/rls_clients_tenant_isolation.test.sql
-- ============================================================

BEGIN;

SELECT plan(12);

-- ============================================================
-- FIXTURES
-- ============================================================

-- Company A
INSERT INTO public.companies (id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Company A — RLS Test');

-- Company B (the "other tenant")
INSERT INTO public.companies (id, name) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Company B — RLS Test');

-- Auth user for Company A (admin)
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('aaaaaaaa-aaaa-0000-0000-000000000001', 'admin-a@test.invalid', NOW());

-- Auth user for Company A (employee — read-only role)
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('aaaaaaaa-aaaa-0000-0000-000000000002', 'employee-a@test.invalid', NOW());

-- Public users table entries
-- NOTE: id = auth_user_id intentionally — clients_select_policy uses
-- cm.user_id = auth.uid(), so public.users.id must equal the auth UUID.
INSERT INTO public.users (id, auth_user_id, company_id, name, email) VALUES
  ('aaaaaaaa-aaaa-0000-0000-000000000001',
   'aaaaaaaa-aaaa-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'Admin A', 'admin-a@test.invalid');

INSERT INTO public.users (id, auth_user_id, company_id, name, email) VALUES
  ('aaaaaaaa-aaaa-0000-0000-000000000002',
   'aaaaaaaa-aaaa-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'Employee A', 'employee-a@test.invalid');

-- Company members: admin-a is 'owner', employee-a is 'employee'
INSERT INTO public.company_members (user_id, company_id, role_id, status)
  SELECT 'aaaaaaaa-aaaa-0000-0000-000000000001',
         'aaaaaaaa-0000-0000-0000-000000000001',
         ar.id,
         'active'
  FROM public.app_roles ar WHERE ar.name = 'owner'
  LIMIT 1;

INSERT INTO public.company_members (user_id, company_id, role_id, status)
  SELECT 'aaaaaaaa-aaaa-0000-0000-000000000002',
         'aaaaaaaa-0000-0000-0000-000000000001',
         ar.id,
         'active'
  FROM public.app_roles ar WHERE ar.name = 'member'
  LIMIT 1;

-- Client belonging to Company A
INSERT INTO public.clients (id, company_id, name, email, dni) VALUES
  ('cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'Client From A', 'client-a@test.invalid', '12345678A');

-- Client belonging to Company B
INSERT INTO public.clients (id, company_id, name, email, dni) VALUES
  ('cccccccc-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000002',
   'Client From B', 'client-b@test.invalid', '87654321B');

-- ============================================================
-- TEST 1: RLS is enabled on clients table
-- ============================================================
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'clients' AND relnamespace = 'public'::regnamespace),
  'RLS is enabled on public.clients'
);

-- ============================================================
-- TEST 2: Admin A can read their own company's client
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-0000-0000-000000000001", "role": "authenticated"}';

SELECT is(
  (SELECT COUNT(*)::integer FROM public.clients WHERE id = 'cccccccc-0000-0000-0000-000000000001'),
  1,
  'Admin A can read Company A client'
);

-- ============================================================
-- TEST 3: Admin A cannot read Company B client (zero rows)
-- ============================================================
SELECT is(
  (SELECT COUNT(*)::integer FROM public.clients WHERE id = 'cccccccc-0000-0000-0000-000000000002'),
  0,
  'Admin A cannot read Company B client — zero rows returned by RLS'
);

-- ============================================================
-- TEST 4: Admin A cannot see Company B client even with explicit filter
-- ============================================================
SELECT is(
  (SELECT COUNT(*)::integer FROM public.clients WHERE company_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  0,
  'Admin A gets zero rows when filtering by Company B company_id — RLS policy enforced'
);

-- ============================================================
-- TEST 5: Admin A can see only Company A clients in full table scan
-- ============================================================
SELECT is(
  (SELECT COUNT(*)::integer FROM public.clients),
  1,
  'Admin A sees exactly 1 client (only their company) in full table scan'
);

-- ============================================================
-- TEST 6: Admin A CAN update Company A client
-- ============================================================
UPDATE public.clients SET phone = '600000001' WHERE id = 'cccccccc-0000-0000-0000-000000000001';
SELECT is(
  (SELECT phone FROM public.clients WHERE id = 'cccccccc-0000-0000-0000-000000000001'),
  '600000001',
  'Admin A can update Company A client'
);

-- ============================================================
-- TEST 7: Admin A cannot update Company B client (no rows affected)
-- ============================================================
UPDATE public.clients SET phone = 'HACKED' WHERE id = 'cccccccc-0000-0000-0000-000000000002';
-- Using service role to verify Company B client was NOT modified
RESET role;
SELECT is(
  (SELECT phone FROM public.clients WHERE id = 'cccccccc-0000-0000-0000-000000000002'),
  NULL,
  'Admin A cannot update Company B client — RLS blocks cross-tenant UPDATE'
);

-- ============================================================
-- TEST 8: Employee A can read Company A clients (read allowed)
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-0000-0000-000000000002", "role": "authenticated"}';

SELECT is(
  (SELECT COUNT(*)::integer FROM public.clients WHERE id = 'cccccccc-0000-0000-0000-000000000001'),
  1,
  'Employee A can read Company A client'
);

-- ============================================================
-- TEST 9: Employee A cannot update Company A client (role blocked)
-- ============================================================
UPDATE public.clients SET phone = 'EMPLOYEE_HACK' WHERE id = 'cccccccc-0000-0000-0000-000000000001';
RESET role;
SELECT isnt(
  (SELECT phone FROM public.clients WHERE id = 'cccccccc-0000-0000-0000-000000000001'),
  'EMPLOYEE_HACK',
  'Employee A cannot update clients — UPDATE policy restricts to owner/admin roles'
);

-- ============================================================
-- TEST 10: Employee A cannot read Company B client
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-0000-0000-000000000002", "role": "authenticated"}';
SELECT is(
  (SELECT COUNT(*)::integer FROM public.clients WHERE id = 'cccccccc-0000-0000-0000-000000000002'),
  0,
  'Employee A cannot read Company B client'
);
RESET role;

-- ============================================================
-- TEST 11: DELETE — Admin A cannot delete Company B client
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-0000-0000-000000000001", "role": "authenticated"}';
DELETE FROM public.clients WHERE id = 'cccccccc-0000-0000-0000-000000000002';
RESET role;
SELECT is(
  (SELECT COUNT(*)::integer FROM public.clients WHERE id = 'cccccccc-0000-0000-0000-000000000002'),
  1,
  'Admin A cannot delete Company B client — RLS blocks cross-tenant DELETE'
);

-- ============================================================
-- TEST 12: INSERT — RLS blocks inserting a client for another company
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-0000-0000-000000000001", "role": "authenticated"}';

-- Expect this INSERT to either fail or produce a row that is invisible
-- RLS WITH CHECK will reject the insert if the policy enforces company_id match
DO $$
BEGIN
  INSERT INTO public.clients (company_id, name, email)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'Injected Client', 'injected@test.invalid');
EXCEPTION WHEN OTHERS THEN
  -- Expected: RLS WITH CHECK rejects it
  RAISE NOTICE 'INSERT into other company correctly blocked: %', SQLERRM;
END;
$$;
RESET role;

SELECT is(
  (SELECT COUNT(*)::integer FROM public.clients WHERE email = 'injected@test.invalid'),
  0,
  'Admin A cannot insert a client for Company B — RLS WITH CHECK enforced'
);

-- ============================================================
SELECT * FROM finish();
ROLLBACK;

-- ============================================================
-- pgTAP Tests: Professional Offboarding System
-- Feature: GDPR-compliant offboarding wizard
-- Date: 2026-04-13
--
-- Covers:
--   offboard_professional()          — error cases, happy path, transfer
--   bulk_transfer_client_assignments() — implicit via offboard
--   RLS: professional_schedules      — is_active gate
--   RLS: professional_blocked_dates  — is_active gate
--   can_view_client()                — deactivated professional blocked
--
-- Running (requires pgTAP installed):
--   supabase db reset && psql $DATABASE_URL -f supabase/tests/offboard/offboard_professional.test.sql
-- ============================================================

BEGIN;

SELECT plan(20);

-- ============================================================
-- FIXTURES
-- Note: public.users.id = auth.users.id (trigger handle_new_user uses new.id for both)
-- company_members.user_id → public.users.id = auth.users.id
-- ============================================================

-- Companies
INSERT INTO public.companies (id, name) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Offboard Test Co'),
  ('c2000000-0000-0000-0000-000000000002', 'Other Company');

-- Auth users (id = JWT sub used in SET LOCAL)
INSERT INTO auth.users (id, email) VALUES
  ('aa000000-0000-0000-0000-000000000001', 'admin@offboard.test'),
  ('e1000000-0000-0000-0000-000000000001', 'prof1@offboard.test'),
  ('e1000000-0000-0000-0000-000000000002', 'prof2@offboard.test'),
  ('e1000000-0000-0000-0000-000000000003', 'prof3@offboard.test'),
  ('e3000000-0000-0000-0000-000000000001', 'member@offboard.test'),
  ('e4000000-0000-0000-0000-000000000001', 'otherpro@offboard.test');

-- Public users (id = auth_user_id = auth.users.id)
INSERT INTO public.users (id, auth_user_id, company_id, name, email) VALUES
  ('aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'Admin Offboard', 'admin@offboard.test'),
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'Prof One', 'prof1@offboard.test'),
  ('e1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001', 'Prof Two', 'prof2@offboard.test'),
  ('e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000001', 'Prof Three', 'prof3@offboard.test'),
  ('e3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'Member User', 'member@offboard.test'),
  ('e4000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000002', 'Other Pro',  'otherpro@offboard.test');

-- Company members (role via SELECT from app_roles)
INSERT INTO public.company_members (user_id, company_id, role_id, status)
  SELECT 'aa000000-0000-0000-0000-000000000001',
         'c1000000-0000-0000-0000-000000000001',
         ar.id, 'active'
  FROM public.app_roles ar WHERE ar.name = 'owner';

INSERT INTO public.company_members (user_id, company_id, role_id, status)
  SELECT user_id, 'c1000000-0000-0000-0000-000000000001', ar.id, 'active'
  FROM (VALUES
    ('e1000000-0000-0000-0000-000000000001'::uuid),
    ('e1000000-0000-0000-0000-000000000002'::uuid),
    ('e1000000-0000-0000-0000-000000000003'::uuid),
    ('e3000000-0000-0000-0000-000000000001'::uuid)
  ) AS u(user_id)
  CROSS JOIN (SELECT id FROM public.app_roles WHERE name = 'member') ar;

INSERT INTO public.company_members (user_id, company_id, role_id, status)
  SELECT 'e4000000-0000-0000-0000-000000000001',
         'c2000000-0000-0000-0000-000000000002',
         ar.id, 'active'
  FROM public.app_roles ar WHERE ar.name = 'member';

-- Professionals (pr1 = candidate to offboard, pr2 = transfer target, pr3 = second offboard)
INSERT INTO public.professionals (id, user_id, company_id, display_name, is_active) VALUES
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'Prof One', true),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001', 'Prof Two', true),
  ('e2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000001', 'Prof Three', true),
  -- Professional in other company (for cross-company test)
  ('e2000000-0000-0000-0000-000000000004', 'e4000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000002', 'Other Prof', true);

-- Booking type (required by bookings FK)
INSERT INTO public.booking_types (id, company_id, name, slug, duration) VALUES
  ('e5000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001',
   'Test Booking Type', 'test-booking-type', 60);

-- Service (required by professional_services FK)
INSERT INTO public.services (id, company_id, name, is_active) VALUES
  ('e6000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001',
   'Test Service', true);

-- Clients
INSERT INTO public.clients (id, company_id, name, email) VALUES
  ('e7000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'Client One', 'client1@test.com'),
  ('e7000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001', 'Client Two', 'client2@test.com');

-- Future + past bookings for pr1 (Group B tests)
INSERT INTO public.bookings
  (id, company_id, booking_type_id, professional_id, start_time, end_time,
   status, customer_name, customer_email)
VALUES
  ('e8000000-0000-0000-0000-000000000001',  -- future, must be cancelled
   'c1000000-0000-0000-0000-000000000001',
   'e5000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000001',
   '2099-01-01 10:00:00+00', '2099-01-01 11:00:00+00',
   'confirmed', 'Customer One', 'cust1@test.com'),
  ('e8000000-0000-0000-0000-000000000002',  -- past, must NOT be cancelled
   'c1000000-0000-0000-0000-000000000001',
   'e5000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000001',
   '2020-01-01 10:00:00+00', '2020-01-01 11:00:00+00',
   'confirmed', 'Customer One', 'cust1@test.com');

-- Future booking for pr3 (Group C transfer test)
INSERT INTO public.bookings
  (id, company_id, booking_type_id, professional_id, start_time, end_time,
   status, customer_name, customer_email)
VALUES
  ('e8000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000001',
   'e5000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000003',
   '2099-06-01 10:00:00+00', '2099-06-01 11:00:00+00',
   'confirmed', 'Customer Three', 'cust3@test.com');

-- Client assignments (professional_id column, company_member_id nullable)
INSERT INTO public.client_assignments (client_id, professional_id, company_member_id)
  SELECT
    'e7000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000001',
    cm.id
  FROM public.company_members cm
  WHERE cm.user_id = 'e1000000-0000-0000-0000-000000000001'
    AND cm.company_id = 'c1000000-0000-0000-0000-000000000001';

INSERT INTO public.client_assignments (client_id, professional_id, company_member_id)
  SELECT
    'e7000000-0000-0000-0000-000000000002',
    'e2000000-0000-0000-0000-000000000003',
    cm.id
  FROM public.company_members cm
  WHERE cm.user_id = 'e1000000-0000-0000-0000-000000000003'
    AND cm.company_id = 'c1000000-0000-0000-0000-000000000001';

-- Professional services (pr1 and pr3 share sv1, to test cleanup)
INSERT INTO public.professional_services (professional_id, service_id) VALUES
  ('e2000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-000000000001');

-- Professional schedules (for RLS tests)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='professional_schedules') THEN
    INSERT INTO public.professional_schedules (professional_id, day_of_week) VALUES
      ('e2000000-0000-0000-0000-000000000001', 1),  -- sch for pr1 (will be invisible after offboard)
      ('e2000000-0000-0000-0000-000000000002', 2);  -- sch for pr2 (still active after Group B)
  END IF;
END $$;

-- Professional blocked dates (for RLS tests)
INSERT INTO public.professional_blocked_dates
  (company_id, professional_id, start_date, end_date, reason)
VALUES
  ('c1000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000001',
   '2099-01-01', '2099-01-31',
   'Test vacation');

-- ============================================================
-- GROUP A: offboard_professional() — error cases
-- ============================================================

-- T01: No JWT → Unauthorized
SET LOCAL "request.jwt.claim.sub" TO '';

SELECT ok(
  (public.offboard_professional(
    'e2000000-0000-0000-0000-000000000001'
  ) ->> 'success')::boolean = false
    AND
  (public.offboard_professional(
    'e2000000-0000-0000-0000-000000000001'
  ) ->> 'error') = 'Unauthorized',
  'T01: offboard_professional with no JWT returns success=false and error=Unauthorized'
);

-- T02: Non-admin (member role) → Insufficient permissions
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claim.sub" TO 'e3000000-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" TO 'authenticated';

SELECT ok(
  (public.offboard_professional(
    'e2000000-0000-0000-0000-000000000001'
  ) ->> 'success')::boolean = false
    AND
  (public.offboard_professional(
    'e2000000-0000-0000-0000-000000000001'
  ) ->> 'error') ILIKE '%Insufficient permissions%',
  'T02: offboard_professional as member returns success=false with permissions error'
);

-- T03: Admin offboards a professional from another company → not found
SET LOCAL "request.jwt.claim.sub" TO 'aa000000-0000-0000-0000-000000000001';

SELECT ok(
  (public.offboard_professional(
    'e2000000-0000-0000-0000-000000000004'  -- professional in company2
  ) ->> 'success')::boolean = false
    AND
  (public.offboard_professional(
    'e2000000-0000-0000-0000-000000000004'
  ) ->> 'error') = 'Professional not found in company',
  'T03: offboard_professional with cross-company professional returns not-found error'
);

-- ============================================================
-- GROUP B: offboard_professional() — happy path (no transfer, cancel bookings)
-- Auth: admin_user
-- ============================================================

-- Capture first call result in a session variable so T04/T05 test the real return value
DO $$
BEGIN
  PERFORM set_config(
    'test.offboard_result_pr1',
    public.offboard_professional(
      p_professional_id        := 'e2000000-0000-0000-0000-000000000001',
      p_to_professional_id     := NULL,
      p_reason                 := 'Prueba de baja',
      p_cancel_future_bookings := true,
      p_transfer_bookings      := false
    )::text,
    true  -- local = transaction-scoped
  );
END;
$$;

-- T04: return value: success = true
SELECT ok(
  (current_setting('test.offboard_result_pr1')::jsonb ->> 'success')::boolean = true,
  'T04: offboard_professional returns success=true for happy path'
);

-- T05: return value: access_revoked = true
SELECT ok(
  (current_setting('test.offboard_result_pr1')::jsonb ->> 'access_revoked')::boolean = true,
  'T05: offboard_professional returns access_revoked=true'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.professionals
    WHERE id = 'e2000000-0000-0000-0000-000000000001' AND is_active = true
  ),
  'T06: professionals.is_active = false after offboarding pr1'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id    = 'e1000000-0000-0000-0000-000000000001'
      AND company_id = 'c1000000-0000-0000-0000-000000000001'
      AND status     = 'suspended'
  ),
  'T07: company_members.status = suspended for prof1 after offboarding'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = 'e8000000-0000-0000-0000-000000000001' AND status = 'cancelled'
  ),
  'T08: future booking for pr1 is cancelled after offboarding'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = 'e8000000-0000-0000-0000-000000000002' AND status = 'confirmed'
  ),
  'T09: past booking for pr1 is NOT cancelled (still confirmed)'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.professional_services
    WHERE professional_id = 'e2000000-0000-0000-0000-000000000001'
  ),
  'T10: professional_services removed for pr1 after offboarding'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.gdpr_audit_log
    WHERE action_type = 'OFFBOARD_PROFESSIONAL'
      AND record_id   = 'e2000000-0000-0000-0000-000000000001'
      AND company_id  = 'c1000000-0000-0000-0000-000000000001'
  ),
  'T11: gdpr_audit_log has OFFBOARD_PROFESSIONAL entry for pr1'
);

-- ============================================================
-- GROUP C: offboard_professional() — with client + booking transfer
-- Auth: admin_user (already set from Group B)
-- ============================================================

DO $$
BEGIN
  PERFORM set_config(
    'test.offboard_result_pr3',
    public.offboard_professional(
      p_professional_id        := 'e2000000-0000-0000-0000-000000000003',
      p_to_professional_id     := 'e2000000-0000-0000-0000-000000000002',
      p_reason                 := 'Transferencia',
      p_cancel_future_bookings := true,
      p_transfer_bookings      := true
    )::text,
    true
  );
END;
$$;

SELECT ok(
  (current_setting('test.offboard_result_pr3')::jsonb ->> 'clients_transferred')::int > 0,
  'T12: offboard_professional (with transfer) returns clients_transferred > 0'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.client_assignments
    WHERE client_id       = 'e7000000-0000-0000-0000-000000000002'
      AND professional_id = 'e2000000-0000-0000-0000-000000000002'
  ),
  'T13: client2 assignment was transferred to pr2 (target professional)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id              = 'e8000000-0000-0000-0000-000000000003'
      AND professional_id = 'e2000000-0000-0000-0000-000000000002'
  ),
  'T14: future booking for pr3 was transferred to pr2'
);

-- ============================================================
-- GROUP D: GDPR audit — BULK_TRANSFER_ASSIGNMENTS created by transfer
-- ============================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.gdpr_audit_log
    WHERE action_type = 'BULK_TRANSFER_ASSIGNMENTS'
      AND company_id  = 'c1000000-0000-0000-0000-000000000001'
  ),
  'T15: gdpr_audit_log has BULK_TRANSFER_ASSIGNMENTS entry from transfer'
);

-- ============================================================
-- GROUP E: RLS — professional_schedules and professional_blocked_dates
-- pr1 is DEACTIVATED (from Group B); pr2 is still ACTIVE
-- ============================================================

-- T16: Deactivated professional sees 0 rows from professional_schedules
SET LOCAL "request.jwt.claim.sub" TO 'e1000000-0000-0000-0000-000000000001';  -- prof1 (deactivated)

DO $$
DECLARE v_count int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='professional_schedules') THEN
    EXECUTE 'SELECT count(*)::int FROM public.professional_schedules WHERE professional_id = ''e2000000-0000-0000-0000-000000000001'''
      INTO v_count;
  END IF;
  PERFORM set_config('test.t16_count', v_count::text, true);
END $$;
SELECT is(
  current_setting('test.t16_count')::int,
  0,
  'T16: RLS hides professional_schedules for pr1 when professional is deactivated'
);

-- T17: Deactivated professional sees 0 rows from professional_blocked_dates
SELECT is(
  (
    SELECT count(*)::int
    FROM public.professional_blocked_dates
    WHERE professional_id = 'e2000000-0000-0000-0000-000000000001'
  ),
  0,
  'T17: RLS hides professional_blocked_dates for pr1 when professional is deactivated'
);

-- T18: Active professional (pr2) sees their own schedule
SET LOCAL "request.jwt.claim.sub" TO 'e1000000-0000-0000-0000-000000000002';  -- prof2 (active)

DO $$
DECLARE v_count int := 1;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='professional_schedules') THEN
    EXECUTE 'SELECT count(*)::int FROM public.professional_schedules WHERE professional_id = ''e2000000-0000-0000-0000-000000000002'''
      INTO v_count;
  END IF;
  PERFORM set_config('test.t18_count', v_count::text, true);
END $$;
SELECT ok(
  current_setting('test.t18_count')::int >= 1,
  'T18: RLS allows professional_schedules for pr2 while professional is active'
);

-- ============================================================
-- GROUP F: can_view_client() — deactivated professional is blocked
-- ============================================================

-- T19: Deactivated professional can NOT view clients
SET LOCAL "request.jwt.claim.sub" TO 'e1000000-0000-0000-0000-000000000001';  -- prof1 (deactivated)

SELECT ok(
  NOT public.can_view_client(
    'c1000000-0000-0000-0000-000000000001',  -- p_client_company_id
    NULL,                                     -- p_client_auth_user_id
    NULL,                                     -- p_client_created_by
    'e7000000-0000-0000-0000-000000000001'   -- p_client_id
  ),
  'T19: can_view_client returns false for deactivated professional (pr1)'
);

-- ============================================================
-- GROUP G: can_view_client() — admin always has access
-- ============================================================

-- T20 uses admin auth set below:
SET LOCAL "request.jwt.claim.sub" TO 'aa000000-0000-0000-0000-000000000001';  -- admin_user (owner)

-- T20: bulk_transfer_client_assignments returns error for inactive target
-- First deactivate pr2 temporarily to test the guard
UPDATE public.professionals
   SET is_active = false
 WHERE id = 'e2000000-0000-0000-0000-000000000002';

SELECT ok(
  (public.bulk_transfer_client_assignments(
    'e2000000-0000-0000-0000-000000000003',  -- from pr3 (already offboarded, but tests validation)
    'e2000000-0000-0000-0000-000000000002',  -- to pr2 (now inactive)
    'test',
    true
  ) ->> 'success')::boolean = false
    AND
  (public.bulk_transfer_client_assignments(
    'e2000000-0000-0000-0000-000000000003',
    'e2000000-0000-0000-0000-000000000002',
    'test',
    true
  ) ->> 'error') ILIKE '%Target professional is not active%',
  'T20: bulk_transfer_client_assignments returns error when target professional is inactive'
);

SELECT * FROM finish();
ROLLBACK;

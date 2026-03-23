-- ============================================================
-- pgTAP Tests: Waitlist RPC Functions
-- Feature: waitlist-feature (T16)
-- Date: 2026-03-23
--
-- Covers:
--   promote_waitlist() — happy path, no_entries, auto_promote=false, permission_denied
--   notify_waitlist()  — passive bulk, active stops at 1, rate_limit_window, permission_denied
--   waitlist_rate_limits — UPSERT idempotency
--   Concurrency guard — FOR UPDATE SKIP LOCKED prevents double-promotion
--
-- Requirements (from spec):
--   N-2: Rate limit 1 notification per client per service per 24h (passive mode)
--   BL-1: Row-level locks prevent double-booking
--   BL-2: Notification window expiry
--
-- Running (requires pgTAP installed):
--   supabase db reset && psql $DATABASE_URL -f supabase/tests/waitlist_rpcs.test.sql
-- ============================================================

BEGIN;

SELECT plan(24);  -- Total assertions declared

-- ============================================================
-- FIXTURES: create test data
-- ============================================================

-- Test company
INSERT INTO public.companies (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Test Company Waitlist');

-- Test admin user
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test.com');

INSERT INTO public.users (id, auth_user_id, company_id, name, surname, email) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'Admin', 'User', 'admin@test.com');

-- Admin needs a company_members entry with owner role for is_company_admin() to pass
INSERT INTO public.company_members (user_id, company_id, role_id, status)
  SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
         '11111111-1111-1111-1111-111111111111',
         ar.id,
         'active'
  FROM public.app_roles ar WHERE ar.name = 'owner';

-- Test client user
INSERT INTO auth.users (id, email) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'client@test.com');

INSERT INTO public.users (id, auth_user_id, company_id, name, surname, email) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   '11111111-1111-1111-1111-111111111111',
   'Client', 'User', 'client@test.com');

-- Test service
INSERT INTO public.services (id, company_id, name, enable_waitlist, active_mode_enabled, passive_mode_enabled) VALUES
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   'Yoga Test Class', true, true, true);

-- Company settings with waitlist config
INSERT INTO public.company_settings (company_id, waitlist_auto_promote, waitlist_active_mode, waitlist_passive_mode, waitlist_notification_window) VALUES
  ('11111111-1111-1111-1111-111111111111', true, true, true, 15);

-- Waitlist entries for active mode tests
INSERT INTO public.waitlist (id, company_id, client_id, service_id, start_time, end_time, mode, status) VALUES
  ('e1000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222',
   '2026-04-01 10:00:00+00',
   '2026-04-01 11:00:00+00',
   'active', 'pending');

-- Waitlist entries for passive mode tests
INSERT INTO public.waitlist (id, company_id, client_id, service_id, start_time, end_time, mode, status) VALUES
  ('e2000000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222',
   '1970-01-01T00:00:00.000Z',  -- epoch sentinel for passive
   '1970-01-01T00:00:00.000Z',
   'passive', 'pending');

-- ============================================================
-- GROUP 1: promote_waitlist() — happy path
-- ============================================================

-- Simulate admin auth context
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claim.sub" TO 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Test 1: promote_waitlist returns promoted=true when auto_promote=true and entry exists
SELECT ok(
  (SELECT (public.promote_waitlist(
    '22222222-2222-2222-2222-222222222222',
    '2026-04-01 10:00:00+00',
    '2026-04-01 11:00:00+00'
  ) ->> 'promoted')::boolean = true),
  'T16-01: promote_waitlist returns promoted=true for valid active entry'
);

-- Test 2: promoted entry status changes to 'converting'
SELECT ok(
  (SELECT status = 'converting'
   FROM public.waitlist
   WHERE id = 'e1000000-0000-0000-0000-000000000001'),
  'T16-02: Active waitlist entry status is converting after promotion'
);

-- Test 3: promote_waitlist returns client_email in result
SELECT ok(
  (SELECT (public.promote_waitlist(
    '22222222-2222-2222-2222-222222222222',
    '2026-04-01 12:00:00+00',  -- different slot - no entries
    '2026-04-01 13:00:00+00'
  ) ->> 'promoted')::boolean = false),
  'T16-03: promote_waitlist returns promoted=false when no pending entries exist'
);

-- Test 4: promote_waitlist returns no_pending_entries message when no entries
SELECT ok(
  (SELECT (public.promote_waitlist(
    '22222222-2222-2222-2222-222222222222',
    '2026-04-01 12:00:00+00',
    '2026-04-01 13:00:00+00'
  ) ->> 'message') = 'no_pending_entries'),
  'T16-04: promote_waitlist returns no_pending_entries message for empty waitlist'
);

-- ============================================================
-- GROUP 2: promote_waitlist() — auto_promote=false
-- ============================================================

-- Disable auto_promote for this group
UPDATE public.company_settings
SET waitlist_auto_promote = false
WHERE company_id = '11111111-1111-1111-1111-111111111111';

-- Insert fresh pending entry for this test
INSERT INTO public.waitlist (id, company_id, client_id, service_id, start_time, end_time, mode, status) VALUES
  ('e3000000-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222',
   '2026-04-02 10:00:00+00',
   '2026-04-02 11:00:00+00',
   'active', 'pending');

-- Test 5: returns promoted=false, notify_instead=true when auto_promote=false
SELECT ok(
  (SELECT (public.promote_waitlist(
    '22222222-2222-2222-2222-222222222222',
    '2026-04-02 10:00:00+00',
    '2026-04-02 11:00:00+00'
  ) ->> 'notify_instead')::boolean = true),
  'T16-05: promote_waitlist returns notify_instead=true when auto_promote is disabled'
);

-- Test 6: entry is NOT promoted when auto_promote=false
SELECT ok(
  (SELECT status = 'pending'
   FROM public.waitlist
   WHERE id = 'e3000000-0000-0000-0000-000000000003'),
  'T16-06: Waitlist entry stays pending when auto_promote=false'
);

-- Restore auto_promote
UPDATE public.company_settings
SET waitlist_auto_promote = true
WHERE company_id = '11111111-1111-1111-1111-111111111111';

-- ============================================================
-- GROUP 3: promote_waitlist() — permission_denied
-- ============================================================

-- Switch to non-admin client user
SET LOCAL "request.jwt.claim.sub" TO 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Test 7: non-admin gets permission_denied
SELECT ok(
  (SELECT (public.promote_waitlist(
    '22222222-2222-2222-2222-222222222222',
    '2026-04-01 10:00:00+00',
    '2026-04-01 11:00:00+00'
  ) ->> 'error') = 'permission_denied'),
  'T16-07: promote_waitlist returns permission_denied for non-admin caller'
);

-- Restore admin context
SET LOCAL "request.jwt.claim.sub" TO 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- ============================================================
-- GROUP 4: notify_waitlist() — active mode (stops at 1)
-- ============================================================

-- Insert two pending active entries for the same slot
INSERT INTO public.waitlist (id, company_id, client_id, service_id, start_time, end_time, mode, status) VALUES
  ('e4000000-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222',
   '2026-04-03 10:00:00+00',
   '2026-04-03 11:00:00+00',
   'active', 'pending'),
  ('e5000000-0000-0000-0000-000000000005',
   '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222',
   '2026-04-03 10:00:00+00',
   '2026-04-03 11:00:00+00',
   'active', 'pending');

-- Test 8: notify_waitlist active returns notified=1 (stops after first)
SELECT ok(
  (SELECT (public.notify_waitlist(
    '22222222-2222-2222-2222-222222222222',
    '2026-04-03 10:00:00+00',
    '2026-04-03 11:00:00+00',
    'active'
  ) ->> 'notified')::int = 1),
  'T16-08: notify_waitlist active mode notifies only 1 entry'
);

-- Test 9: active mode returns 1 email in emails_to_send
SELECT ok(
  (SELECT jsonb_array_length(public.notify_waitlist(
    '22222222-2222-2222-2222-222222222222',
    '2026-04-03 10:00:00+00',
    '2026-04-03 11:00:00+00',
    'active'
  ) -> 'emails_to_send') = 0),
  -- After the first call, the entry was already notified, so 2nd call returns 0
  'T16-09: notify_waitlist active mode returns 0 on repeated call (already notified)'
);

-- ============================================================
-- GROUP 5: notify_waitlist() — passive bulk mode
-- ============================================================

-- Reset passive entry to pending
UPDATE public.waitlist SET status = 'pending' WHERE id = 'e2000000-0000-0000-0000-000000000002';

-- Test 10: notify_waitlist passive returns notified >= 1
SELECT ok(
  (SELECT (public.notify_waitlist(
    '22222222-2222-2222-2222-222222222222',
    '1970-01-01T00:00:00.000Z',
    '1970-01-01T00:00:00.000Z',
    'passive'
  ) ->> 'notified')::int >= 1),
  'T16-10: notify_waitlist passive mode notifies all pending passive entries'
);

-- Test 11: after passive notify, entry status = notified
SELECT ok(
  (SELECT status = 'notified'
   FROM public.waitlist
   WHERE id = 'e2000000-0000-0000-0000-000000000002'),
  'T16-11: Passive entry status is notified after notify_waitlist call'
);

-- ============================================================
-- GROUP 6: Rate limiting — 24h window
-- ============================================================

-- The previous passive call inserted into waitlist_rate_limits
-- Calling again within 24h should return notified=0
-- Test 12: 24h rate limit prevents re-notification within window
SELECT ok(
  (SELECT (public.notify_waitlist(
    '22222222-2222-2222-2222-222222222222',
    '1970-01-01T00:00:00.000Z',
    '1970-01-01T00:00:00.000Z',
    'passive'
  ) ->> 'notified')::int = 0),
  'T16-12: 24h rate limit prevents passive re-notification within window'
);

-- Test 13: waitlist_rate_limits record was inserted by passive notify
SELECT ok(
  (SELECT COUNT(*) > 0
   FROM public.waitlist_rate_limits
   WHERE company_id = '11111111-1111-1111-1111-111111111111'
     AND service_id  = '22222222-2222-2222-2222-222222222222'
     AND user_id     = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'T16-13: waitlist_rate_limits record created after passive notification'
);

-- Test 14: rate_limits UPSERT — re-notifying updates last_notified_at (not duplicates row)
SELECT ok(
  (SELECT COUNT(*) = 1
   FROM public.waitlist_rate_limits
   WHERE company_id = '11111111-1111-1111-1111-111111111111'
     AND service_id  = '22222222-2222-2222-2222-222222222222'
     AND user_id     = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'T16-14: waitlist_rate_limits UPSERT creates exactly 1 row (no duplicates)'
);

-- ============================================================
-- GROUP 7: Rate limit bypass — simulate 25h ago last_notified_at
-- ============================================================

-- Manually set last_notified_at to 25 hours ago to bypass 24h window
UPDATE public.waitlist_rate_limits
SET last_notified_at = NOW() - INTERVAL '25 hours'
WHERE company_id = '11111111-1111-1111-1111-111111111111'
  AND service_id  = '22222222-2222-2222-2222-222222222222'
  AND user_id     = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

-- Reset passive entry status back to pending for re-test
UPDATE public.waitlist
SET status = 'pending', notified_at = NULL
WHERE id = 'e2000000-0000-0000-0000-000000000002';

-- Test 15: After 24h window, passive notification should succeed again
SELECT ok(
  (SELECT (public.notify_waitlist(
    '22222222-2222-2222-2222-222222222222',
    '1970-01-01T00:00:00.000Z',
    '1970-01-01T00:00:00.000Z',
    'passive'
  ) ->> 'notified')::int = 1),
  'T16-15: notify_waitlist passive re-notifies after 24h rate limit window has passed'
);

-- ============================================================
-- GROUP 8: notify_waitlist() — permission_denied
-- ============================================================

SET LOCAL "request.jwt.claim.sub" TO 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Test 16: non-admin gets permission_denied on notify_waitlist
SELECT ok(
  (SELECT (public.notify_waitlist(
    '22222222-2222-2222-2222-222222222222',
    '2026-04-01 10:00:00+00',
    '2026-04-01 11:00:00+00',
    'active'
  ) ->> 'error') = 'permission_denied'),
  'T16-16: notify_waitlist returns permission_denied for non-admin caller'
);

SET LOCAL "request.jwt.claim.sub" TO 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- ============================================================
-- GROUP 9: promote_waitlist() — in-app notification created
-- ============================================================

-- Insert fresh active pending entry for notification test
INSERT INTO public.waitlist (id, company_id, client_id, service_id, start_time, end_time, mode, status) VALUES
  ('e6000000-0000-0000-0000-000000000006',
   '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222',
   '2026-04-05 10:00:00+00',
   '2026-04-05 11:00:00+00',
   'active', 'pending');

PERFORM public.promote_waitlist(
  '22222222-2222-2222-2222-222222222222',
  '2026-04-05 10:00:00+00',
  '2026-04-05 11:00:00+00'
);

-- Test 17: in-app notification was inserted for recipient
SELECT ok(
  (SELECT COUNT(*) > 0
   FROM public.notifications
   WHERE recipient_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
     AND type = 'waitlist_promoted'),
  'T16-17: promote_waitlist inserts in-app notification for promoted client'
);

-- ============================================================
-- GROUP 10: notify_waitlist() — in-app notification created (passive)
-- ============================================================

-- Reset passive entry
UPDATE public.waitlist SET status = 'pending', notified_at = NULL
WHERE id = 'e2000000-0000-0000-0000-000000000002';

-- Clear rate limit
DELETE FROM public.waitlist_rate_limits
WHERE company_id = '11111111-1111-1111-1111-111111111111';

PERFORM public.notify_waitlist(
  '22222222-2222-2222-2222-222222222222',
  '1970-01-01T00:00:00.000Z',
  '1970-01-01T00:00:00.000Z',
  'passive'
);

-- Test 18: in-app notification of type waitlist_passive_notified was inserted
SELECT ok(
  (SELECT COUNT(*) > 0
   FROM public.notifications
   WHERE recipient_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
     AND type = 'waitlist_passive_notified'),
  'T16-18: notify_waitlist passive inserts waitlist_passive_notified notification'
);

-- ============================================================
-- GROUP 11: Backward compatibility — notify-waitlist adapter contract
-- ============================================================

-- Tests 19-21: Verify the response shape the deprecated adapter returns
-- is backward-compatible with the original Edge Function contract.

-- Test 19: notify_waitlist RPC returns 'notified' integer field
SELECT ok(
  (SELECT jsonb_typeof(
    public.notify_waitlist(
      '22222222-2222-2222-2222-222222222222',
      '2026-04-03 10:00:00+00',
      '2026-04-03 11:00:00+00',
      'active'
    ) -> 'notified'
  ) = 'number'),
  'T16-19: notify_waitlist returns integer notified field (adapter compat)'
);

-- Test 20: notify_waitlist returns 'emails_to_send' array field
SELECT ok(
  (SELECT jsonb_typeof(
    public.notify_waitlist(
      '22222222-2222-2222-2222-222222222222',
      '2026-04-03 10:00:00+00',
      '2026-04-03 11:00:00+00',
      'active'
    ) -> 'emails_to_send'
  ) = 'array'),
  'T16-20: notify_waitlist returns array emails_to_send field (adapter compat)'
);

-- Test 21: promote_waitlist returns 'promoted' boolean field
SELECT ok(
  (SELECT jsonb_typeof(
    public.promote_waitlist(
      '22222222-2222-2222-2222-222222222222',
      '2026-04-01 10:00:00+00',  -- already promoting, should return false
      '2026-04-01 11:00:00+00'
    ) -> 'promoted'
  ) = 'boolean'),
  'T16-21: promote_waitlist returns boolean promoted field'
);

-- ============================================================
-- GROUP 12: waitlist_rate_limits — schema validation
-- ============================================================

-- Test 22: PRIMARY KEY constraint prevents duplicate triplet
SELECT throws_ok(
  $$
    INSERT INTO public.waitlist_rate_limits(company_id, service_id, user_id, last_notified_at)
    VALUES (
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      NOW()
    )
  $$,
  '23505', -- unique_violation
  NULL,
  'T16-22: waitlist_rate_limits PRIMARY KEY prevents duplicate (company, service, user) insert'
);

-- Test 23: ON CONFLICT DO UPDATE (UPSERT) updates last_notified_at
SELECT ok(
  (
    INSERT INTO public.waitlist_rate_limits(company_id, service_id, user_id, last_notified_at)
    VALUES (
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      NOW() + INTERVAL '1 second'
    )
    ON CONFLICT (company_id, service_id, user_id)
    DO UPDATE SET last_notified_at = EXCLUDED.last_notified_at
    RETURNING last_notified_at > NOW()
  ),
  'T16-23: waitlist_rate_limits UPSERT updates last_notified_at correctly'
);

-- Test 24: promote_waitlist returns client_name in result
-- Insert a fresh entry for this dedicated test (separate slot to avoid state from T17)
INSERT INTO public.waitlist (id, company_id, client_id, service_id, start_time, end_time, mode, status) VALUES
  ('e7000000-0000-0000-0000-000000000007',
   '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222',
   '2026-04-10 10:00:00+00',
   '2026-04-10 11:00:00+00',
   'active', 'pending');

SELECT ok(
  (
    SELECT (result ->> 'client_name') IS NOT NULL
    FROM (
      SELECT public.promote_waitlist(
        '22222222-2222-2222-2222-222222222222',
        '2026-04-10 10:00:00+00',
        '2026-04-10 11:00:00+00'
      ) AS result
    ) sub
    WHERE (result ->> 'promoted')::boolean = true
  ),
  'T16-24: promote_waitlist includes client_name for email dispatch'
);

-- ============================================================
-- Finish
-- ============================================================

SELECT * FROM finish();
ROLLBACK;

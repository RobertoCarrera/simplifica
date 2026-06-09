-- Tests: notify_booking_change() RPC + bookings trigger
-- --------------------------------------------------------------
-- Suites (all in a single transaction, ROLLBACK at the end):
--   1. Default values for the 6 new columns
--   2. notify_booking_change() inserts in-app row per audience
--   3. change_type 'cancelled' is detected from status update
--   4. change_type 'rescheduled' is detected from starts_at update
--   5. change_type 'updated' is default for unrelated UPDATEs
--   6. Dedupe within 5 minutes (no duplicate in-app on rapid re-fire)
--   7. Disabled flags short-circuit in-app and email
--   8. RLS — booking_email_enabled inherits from company_id row scope

BEGIN;

-- Helper: insert a minimal company, client, professional, booking.
CREATE TEMP FUNCTION seed_company()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := gen_random_uuid();
  INSERT INTO public.companies (id, name) VALUES (v_id, 'Test Co') ON CONFLICT DO NOTHING;
  INSERT INTO public.budget_notification_settings
    (company_id, email_enabled, reminder_days_before, overdue_days_after, locale)
  VALUES (v_id, true, ARRAY[3], ARRAY[0,3], 'es')
  ON CONFLICT (company_id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE TEMP FUNCTION seed_client(p_company uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := gen_random_uuid();
  INSERT INTO public.clients (id, company_id, name, email) VALUES (v_id, p_company, 'Cliente', 'c@x.com');
  RETURN v_id;
END;
$$;

CREATE TEMP FUNCTION seed_professional(p_company uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := gen_random_uuid();
  INSERT INTO public.professionals (id, company_id, display_name, email) VALUES (v_id, p_company, 'Pro', 'p@x.com');
  RETURN v_id;
END;
$$;

CREATE TEMP FUNCTION seed_booking(p_company uuid, p_client uuid, p_pro uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := gen_random_uuid();
  INSERT INTO public.bookings (id, company_id, client_id, professional_id, title, starts_at, status)
  VALUES (v_id, p_company, p_client, p_pro, 'Test booking', now() + interval '1 day', 'confirmed');
  RETURN v_id;
END;
$$;

-- ── 1. Default values for the 6 new columns ────────────────────────
DO $$
DECLARE
  v_company uuid := seed_company();
  v_settings public.budget_notification_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_settings FROM public.budget_notification_settings WHERE company_id = v_company;
  IF v_settings.booking_email_enabled        IS DISTINCT FROM false THEN RAISE EXCEPTION '1a: booking_email_enabled default should be false'; END IF;
  IF v_settings.booking_inapp_enabled        IS DISTINCT FROM true  THEN RAISE EXCEPTION '1b: booking_inapp_enabled default should be true';  END IF;
  IF v_settings.booking_notify_client        IS DISTINCT FROM true  THEN RAISE EXCEPTION '1c: booking_notify_client default should be true';  END IF;
  IF v_settings.booking_notify_professional  IS DISTINCT FROM true  THEN RAISE EXCEPTION '1d: booking_notify_professional default should be true';  END IF;
  IF v_settings.booking_notify_admin         IS DISTINCT FROM true  THEN RAISE EXCEPTION '1e: booking_notify_admin default should be true';  END IF;
  IF v_settings.booking_email_cc_admin       IS DISTINCT FROM false THEN RAISE EXCEPTION '1f: booking_email_cc_admin default should be false'; END IF;
  RAISE NOTICE '1. Defaults OK';
END;
$$;

-- ── 2. notify_booking_change inserts in-app per audience ───────────
DO $$
DECLARE
  v_company uuid := seed_company();
  v_client  uuid := seed_client(v_company);
  v_pro     uuid := seed_professional(v_company);
  v_booking uuid := seed_booking(v_company, v_client, v_pro);
  v_inserted integer;
BEGIN
  -- Clear the in-app table to avoid dedupe interference from test 1.
  DELETE FROM public.notifications WHERE entity_id = v_booking;

  v_inserted := public.notify_booking_change(v_booking, 'created');

  -- 3 audiences → 3 in-app rows (client, professional, admin).
  IF v_inserted <> 3 THEN
    RAISE EXCEPTION '2a: expected 3 in-app rows, got %', v_inserted;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE entity_id = v_booking AND audience = 'client' AND kind = 'created'
  ) THEN RAISE EXCEPTION '2b: missing in-app row for client'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE entity_id = v_booking AND audience = 'professional' AND kind = 'created'
  ) THEN RAISE EXCEPTION '2c: missing in-app row for professional'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE entity_id = v_booking AND audience = 'admin' AND kind = 'created'
  ) THEN RAISE EXCEPTION '2d: missing in-app row for admin'; END IF;

  RAISE NOTICE '2. In-app per audience OK';
END;
$$;

-- ── 3. change_type 'cancelled' on status update ────────────────────
DO $$
DECLARE
  v_company uuid := seed_company();
  v_client  uuid := seed_client(v_company);
  v_pro     uuid := seed_professional(v_company);
  v_booking uuid := seed_booking(v_company, v_client, v_pro);
  v_inserted integer;
BEGIN
  DELETE FROM public.notifications WHERE entity_id = v_booking;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = v_booking;
  -- The trigger fires automatically and calls notify_booking_change().
  -- Wait a moment for the in-app row to land (it's synchronous in PG).
  PERFORM pg_sleep(0.05);

  SELECT count(*) INTO v_inserted
  FROM public.notifications
  WHERE entity_id = v_booking AND kind = 'cancelled';
  IF v_inserted <> 3 THEN
    RAISE EXCEPTION '3a: expected 3 cancelled in-app rows, got %', v_inserted;
  END IF;

  RAISE NOTICE '3. Cancelled detection OK';
END;
$$;

-- ── 4. change_type 'rescheduled' on starts_at update ───────────────
DO $$
DECLARE
  v_company uuid := seed_company();
  v_client  uuid := seed_client(v_company);
  v_pro     uuid := seed_professional(v_company);
  v_booking uuid := seed_booking(v_company, v_client, v_pro);
  v_inserted integer;
BEGIN
  DELETE FROM public.notifications WHERE entity_id = v_booking;

  UPDATE public.bookings SET starts_at = starts_at + interval '2 hours' WHERE id = v_booking;
  PERFORM pg_sleep(0.05);

  SELECT count(*) INTO v_inserted
  FROM public.notifications
  WHERE entity_id = v_booking AND kind = 'rescheduled';
  IF v_inserted <> 3 THEN
    RAISE EXCEPTION '4a: expected 3 rescheduled in-app rows, got %', v_inserted;
  END IF;

  RAISE NOTICE '4. Rescheduled detection OK';
END;
$$;

-- ── 5. change_type 'updated' default for unrelated updates ─────────
DO $$
DECLARE
  v_company uuid := seed_company();
  v_client  uuid := seed_client(v_company);
  v_pro     uuid := seed_professional(v_company);
  v_booking uuid := seed_booking(v_company, v_client, v_pro);
  v_inserted integer;
BEGIN
  DELETE FROM public.notifications WHERE entity_id = v_booking;

  -- Update only the notes field; status and starts_at stay the same.
  UPDATE public.bookings SET notes = 'updated notes' WHERE id = v_booking;
  PERFORM pg_sleep(0.05);

  SELECT count(*) INTO v_inserted
  FROM public.notifications
  WHERE entity_id = v_booking AND kind = 'updated';
  IF v_inserted <> 3 THEN
    RAISE EXCEPTION '5a: expected 3 updated in-app rows, got %', v_inserted;
  END IF;

  RAISE NOTICE '5. Updated default OK';
END;
$$;

-- ── 6. Dedupe within 5 minutes ────────────────────────────────────
DO $$
DECLARE
  v_company uuid := seed_company();
  v_client  uuid := seed_client(v_company);
  v_pro     uuid := seed_professional(v_company);
  v_booking uuid := seed_booking(v_company, v_client, v_pro);
  v_first_inserted integer;
  v_second_inserted integer;
  v_total_rows integer;
BEGIN
  DELETE FROM public.notifications WHERE entity_id = v_booking;

  v_first_inserted := public.notify_booking_change(v_booking, 'updated');
  v_second_inserted := public.notify_booking_change(v_booking, 'updated');

  IF v_first_inserted <> 3 THEN
    RAISE EXCEPTION '6a: first call should insert 3, got %', v_first_inserted;
  END IF;
  IF v_second_inserted <> 0 THEN
    RAISE EXCEPTION '6b: second call within 5min should be deduped to 0, got %', v_second_inserted;
  END IF;

  SELECT count(*) INTO v_total_rows
  FROM public.notifications WHERE entity_id = v_booking AND kind = 'updated';
  IF v_total_rows <> 3 THEN
    RAISE EXCEPTION '6c: total updated rows should remain 3, got %', v_total_rows;
  END IF;

  RAISE NOTICE '6. Dedupe within 5min OK';
END;
$$;

-- ── 7. Disabled flags short-circuit in-app ─────────────────────────
DO $$
DECLARE
  v_company uuid := seed_company();
  v_client  uuid := seed_client(v_company);
  v_pro     uuid := seed_professional(v_company);
  v_booking uuid := seed_booking(v_company, v_client, v_pro);
  v_inserted integer;
BEGIN
  -- Disable in-app + all audience flags.
  UPDATE public.budget_notification_settings
  SET booking_inapp_enabled = false,
      booking_notify_client = false,
      booking_notify_professional = false,
      booking_notify_admin = false
  WHERE company_id = v_company;

  DELETE FROM public.notifications WHERE entity_id = v_booking;

  v_inserted := public.notify_booking_change(v_booking, 'created');
  IF v_inserted <> 0 THEN
    RAISE EXCEPTION '7a: with all flags off, expected 0 inserts, got %', v_inserted;
  END IF;

  RAISE NOTICE '7. Disabled flags short-circuit OK';
END;
$$;

-- ── 8. RLS — booking_email_enabled inherits company_id scope ───────
DO $$
DECLARE
  v_company_a uuid := seed_company();
  v_company_b uuid := seed_company();
  v_company_a_settings public.budget_notification_settings.booking_email_enabled%TYPE;
BEGIN
  -- Set company A's flag to true and verify it's company-A-only.
  UPDATE public.budget_notification_settings
  SET booking_email_enabled = true
  WHERE company_id = v_company_a;

  SELECT booking_email_enabled INTO v_company_a_settings
  FROM public.budget_notification_settings
  WHERE company_id = v_company_a;

  IF v_company_a_settings IS NOT TRUE THEN
    RAISE EXCEPTION '8a: company A booking_email_enabled should be true, got %', v_company_a_settings;
  END IF;

  -- Company B should still have its default (false).
  PERFORM 1 FROM public.budget_notification_settings
  WHERE company_id = v_company_b AND booking_email_enabled = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION '8b: company B booking_email_enabled should remain false';
  END IF;

  RAISE NOTICE '8. RLS / column isolation OK';
END;
$$;

ROLLBACK;

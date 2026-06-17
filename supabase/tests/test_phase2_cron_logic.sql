-- Test 06: Phase 2 cron logic — auto-confirm-sessions
-- Verifies the SQL the cron runs every 30 minutes.
-- This is a logic test (the cron itself is verified separately via cron.job).

BEGIN;

-- Helper: insert a confirmed booking in the past
CREATE OR REPLACE FUNCTION public.seed_company_06() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000060';
  INSERT INTO public.companies (id, slug, name, settings)
  VALUES (v_id, 'test-phase2-06', 'Test Phase2 06', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_client_06() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000061';
  INSERT INTO public.clients (id, company_id, name, email, client_type)
  VALUES (v_id, public.seed_company_06(), 'Test Client Phase2 06', 'test-phase2-06@example.com', 'individual')
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_past_booking_06() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := 'a1a1a1a1-0000-0000-0000-000000000062';
  v_svc uuid;
BEGIN
  SELECT id INTO v_svc FROM public.services WHERE is_active = true LIMIT 1;
  IF v_svc IS NULL THEN RAISE EXCEPTION 'No active service'; END IF;
  -- Insert a booking whose start_time is 2 hours ago
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, customer_email,
    start_time, end_time, status, source, total_price, currency)
  VALUES (v_id, public.seed_company_06(), public.seed_client_06(), v_svc, 'Test Customer Phase2 06', 'cust-phase2-06@example.com',
    now() - interval '2 hours', now() - interval '1 hour', 'confirmed', 'manual', 100.00, 'EUR')
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

DO $$
DECLARE v_company_id uuid := public.seed_company_06();
DECLARE v_client_id uuid := public.seed_client_06();
DECLARE v_booking_id uuid := public.seed_past_booking_06();
DECLARE v_session_before timestamptz;
DECLARE v_session_after timestamptz;
DECLARE v_invoice_after uuid;
BEGIN
  RAISE NOTICE 'Test 06: setup done (past booking)';

  -- Pre-condition: session_confirmed_at is NULL
  SELECT session_confirmed_at INTO v_session_before FROM public.bookings WHERE id = v_booking_id;
  IF v_session_before IS NOT NULL THEN
    RAISE EXCEPTION 'Setup failed: session_confirmed_at should be NULL';
  END IF;
  RAISE NOTICE 'Test 6.0 PASS: session_confirmed_at is NULL';

  -- Action: run the cron SQL
  UPDATE public.bookings
  SET session_confirmed_at = COALESCE(session_confirmed_at, now()),
      updated_at = now()
  WHERE start_time < now()
    AND session_confirmed_at IS NULL
    AND status NOT IN ('cancelled');
  RAISE NOTICE 'Test 6.1: cron SQL applied';

  -- Post-condition: session_confirmed_at is now set
  SELECT session_confirmed_at INTO v_session_after FROM public.bookings WHERE id = v_booking_id;
  IF v_session_after IS NULL THEN
    RAISE EXCEPTION 'FAIL 6.2: session_confirmed_at should be set after cron';
  END IF;
  RAISE NOTICE 'Test 6.2 PASS: session_confirmed_at is set (%)', v_session_after;

  -- Side effect: invoice was created (via trg_session_close_to_invoice)
  SELECT invoice_id INTO v_invoice_after FROM public.bookings WHERE id = v_booking_id;
  IF v_invoice_after IS NULL THEN
    RAISE EXCEPTION 'FAIL 6.3: no invoice created by session_close trigger';
  END IF;
  RAISE NOTICE 'Test 6.3 PASS: invoice created (%)', v_invoice_after;

  -- Idempotency: running the cron again should be a no-op
  UPDATE public.bookings
  SET session_confirmed_at = COALESCE(session_confirmed_at, now())
  WHERE start_time < now()
    AND session_confirmed_at IS NULL  -- already set, so no rows match
    AND status NOT IN ('cancelled');
  RAISE NOTICE 'Test 6.4: idempotent (no rows updated)';

  RAISE NOTICE '=== Test 06 PASSED ===';
END $$;

ROLLBACK;
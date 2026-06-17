-- Test 01: Retroactive quote trigger fires on client_id NULL → NOT NULL
-- Verifies REQ-1.A from booking-retroactive-quote-trigger spec
-- All in a single transaction with ROLLBACK at the end.

BEGIN;

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
CREATE TEMP FUNCTION seed_company_01()
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000010';
  INSERT INTO public.companies (id, slug, name, settings)
  VALUES (v_id, 'test-rqa-01', 'Test RQA 01', '{"quote_lifecycle_mode": "booking-driven"}'::jsonb);
  RETURN v_id;
END;
$$;

CREATE TEMP FUNCTION seed_client_01()
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000011';
  INSERT INTO public.clients (id, company_id, name, email, client_type)
  VALUES (v_id, seed_company_01(), 'Test Client RQA 01', 'test-rqa-01@example.com', 'individual');
  RETURN v_id;
END;
$$;

CREATE TEMP FUNCTION seed_orphan_booking_01()
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := 'a1a1a1a1-0000-0000-0000-000000000012';
  v_svc uuid;
BEGIN
  SELECT id INTO v_svc FROM public.services WHERE is_active = true LIMIT 1;
  IF v_svc IS NULL THEN RAISE EXCEPTION 'No active service'; END IF;
  INSERT INTO public.bookings (id, company_id, service_id, customer_name, customer_email,
    start_time, end_time, status, source, total_price, currency)
  VALUES (v_id, seed_company_01(), v_svc, 'Test Customer RQA 01', 'cust-rqa-01@example.com',
    now() + interval '30 days', now() + interval '30 days 1 hour',
    'confirmed', 'manual', 100.00, 'EUR');
  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Test 1: Pre-condition
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_company_id uuid := seed_company_01();
  v_client_id uuid := seed_client_01();
  v_booking_id uuid := seed_orphan_booking_01();
  v_client_id_actual uuid;
  v_quote_id_actual uuid;
BEGIN
  RAISE NOTICE 'Test 1.1: Setup OK (company=%, client=%, booking=%)',
    v_company_id, v_client_id, v_booking_id;

  SELECT client_id INTO v_client_id_actual FROM public.bookings WHERE id = v_booking_id;
  IF v_client_id_actual IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1.1: client_id should be NULL, got %', v_client_id_actual;
  END IF;
  RAISE NOTICE 'Test 1.1 PASS: client_id is NULL before UPDATE';

  SELECT quote_id INTO v_quote_id_actual FROM public.bookings WHERE id = v_booking_id;
  IF v_quote_id_actual IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1.2: quote_id should be NULL, got %', v_quote_id_actual;
  END IF;
  RAISE NOTICE 'Test 1.2 PASS: quote_id is NULL before UPDATE';
END $$;

-- ----------------------------------------------------------------------------
-- Test 2: Action — set client_id
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_booking_id uuid := 'a1a1a1a1-0000-0000-0000-000000000012';
  v_client_id uuid := 'a1a1a1a1-0000-0000-0000-000000000011';
BEGIN
  UPDATE public.bookings
  SET client_id = v_client_id, updated_at = now()
  WHERE id = v_booking_id;
  RAISE NOTICE 'Test 2.1: UPDATE applied';
END $$;

-- ----------------------------------------------------------------------------
-- Test 3: Post-conditions
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_booking_id uuid := 'a1a1a1a1-0000-0000-0000-000000000012';
  v_quote_id_actual uuid;
  v_status text;
  v_qclient uuid;
BEGIN
  SELECT quote_id INTO v_quote_id_actual FROM public.bookings WHERE id = v_booking_id;
  IF v_quote_id_actual IS NULL THEN
    RAISE EXCEPTION 'FAIL 3.1: quote_id should be set after UPDATE';
  END IF;
  RAISE NOTICE 'Test 3.1 PASS: quote_id is set (%)', v_quote_id_actual;

  SELECT status::text, client_id INTO v_status, v_qclient
  FROM public.quotes WHERE id = v_quote_id_actual;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'FAIL 3.2: status should be draft, got %', v_status;
  END IF;
  RAISE NOTICE 'Test 3.2 PASS: created quote is in draft status';

  IF v_qclient <> 'a1a1a1a1-0000-0000-0000-000000000011'::uuid THEN
    RAISE EXCEPTION 'FAIL 3.3: client_id should match, got %', v_qclient;
  END IF;
  RAISE NOTICE 'Test 3.3 PASS: created quote has correct client_id';
END $$;

RAISE NOTICE '=== ALL TESTS PASSED ===';

ROLLBACK;
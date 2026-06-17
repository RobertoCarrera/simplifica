-- Test 03: Manual-mode tenant is skipped
-- Verifies REQ-1.C

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_company_03() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000030';
  INSERT INTO public.companies (id, slug, name, settings)
  VALUES (v_id, 'test-rqa-03', 'Test RQA 03', '{"quote_lifecycle_mode": "manual"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_client_03() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000031';
  INSERT INTO public.clients (id, company_id, name, email, client_type)
  VALUES (v_id, public.seed_company_03(), 'Test Client RQA 03', 'test-rqa-03@example.com', 'individual')
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_orphan_booking_03() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := 'a1a1a1a1-0000-0000-0000-000000000032';
DECLARE v_svc uuid;
BEGIN
  SELECT id INTO v_svc FROM public.services WHERE is_active = true LIMIT 1;
  IF v_svc IS NULL THEN RAISE EXCEPTION 'No active service'; END IF;
  INSERT INTO public.bookings (id, company_id, service_id, customer_name, customer_email,
    start_time, end_time, status, source, total_price, currency)
  VALUES (v_id, public.seed_company_03(), v_svc, 'Test Customer RQA 03', 'cust-rqa-03@example.com',
    now() + interval '30 days', now() + interval '30 days 1 hour', 'confirmed', 'manual', 100.00, 'EUR')
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

DO $$
DECLARE v_company_id uuid := public.seed_company_03();
DECLARE v_client_id uuid := public.seed_client_03();
DECLARE v_booking_id uuid := public.seed_orphan_booking_03();
DECLARE v_quote_id_actual uuid;
DECLARE v_count int;
BEGIN
  RAISE NOTICE 'Test 03: setup done (manual mode tenant)';

  -- In manual mode, even the v3 INSERT trigger should NOT create a quote
  SELECT count(*) INTO v_count FROM public.quotes WHERE booking_id = v_booking_id;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 3.0: manual mode should not create quote, got %', v_count; END IF;
  RAISE NOTICE 'Test 3.0 PASS: no quote in manual mode';

  -- Action: set client_id
  UPDATE public.bookings SET client_id = v_client_id, updated_at = now() WHERE id = v_booking_id;
  RAISE NOTICE 'Test 3.1: client_id set';

  -- Post-condition: still no quote (manual mode skip)
  SELECT quote_id INTO v_quote_id_actual FROM public.bookings WHERE id = v_booking_id;
  IF v_quote_id_actual IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 3.2: manual mode created quote (%)', v_quote_id_actual;
  END IF;
  RAISE NOTICE 'Test 3.2 PASS: manual mode correctly skipped';

  RAISE NOTICE '=== Test 03 PASSED ===';
END $$;

ROLLBACK;
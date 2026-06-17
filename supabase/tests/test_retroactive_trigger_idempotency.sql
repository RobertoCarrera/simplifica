-- Test 04: Idempotency (REQ-1.D + REQ-1.E + REQ-1.F)
-- - D: client_id update with existing quote -> no new quote
-- - E: pure quote_id update -> trigger is OF client_id, must not fire
-- - F: notes update -> no relevant column touched

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_company_04() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000040';
  INSERT INTO public.companies (id, slug, name, settings)
  VALUES (v_id, 'test-rqa-04', 'Test RQA 04', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_client_04() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000041';
  INSERT INTO public.clients (id, company_id, name, email, client_type)
  VALUES (v_id, public.seed_company_04(), 'Test Client RQA 04', 'test-rqa-04@example.com', 'individual')
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_booking_with_quote_04() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := 'a1a1a1a1-0000-0000-0000-000000000042';
  v_svc uuid;
BEGIN
  SELECT id INTO v_svc FROM public.services WHERE is_active = true LIMIT 1;
  IF v_svc IS NULL THEN RAISE EXCEPTION 'No active service'; END IF;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, customer_email,
    start_time, end_time, status, source, total_price, currency)
  VALUES (v_id, public.seed_company_04(), public.seed_client_04(), v_svc, 'Test Customer RQA 04', 'cust-rqa-04@example.com',
    now() + interval '30 days', now() + interval '30 days 1 hour', 'confirmed', 'manual', 100.00, 'EUR')
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

DO $$
DECLARE v_company_id uuid := public.seed_company_04();
DECLARE v_client_id uuid := public.seed_client_04();
DECLARE v_booking_id uuid := public.seed_booking_with_quote_04();
DECLARE v_n_initial int;
DECLARE v_n_after int;
DECLARE v_quote_id_actual uuid;
BEGIN
  RAISE NOTICE 'Test 04: setup done';
  -- Baseline: v3 INSERT trigger created a quote (since client+service set)
  SELECT count(*) INTO v_n_initial FROM public.quotes WHERE booking_id = v_booking_id;
  IF v_n_initial < 1 THEN RAISE EXCEPTION 'Setup failed: no baseline quote'; END IF;
  RAISE NOTICE 'Baseline: % quotes', v_n_initial;

  -- Test 04.D: client_id update (same value) — must not create new quote
  UPDATE public.bookings SET client_id = v_client_id, updated_at = now() WHERE id = v_booking_id;
  SELECT count(*) INTO v_n_after FROM public.quotes WHERE booking_id = v_booking_id;
  IF v_n_after <> v_n_initial THEN RAISE EXCEPTION 'FAIL 4.D: was %, now %', v_n_initial, v_n_after; END IF;
  RAISE NOTICE 'Test 4.D PASS';

  -- Test 04.E: pure quote_id update — trigger is OF client_id/service_id, must not fire
  SELECT quote_id INTO v_quote_id_actual FROM public.bookings WHERE id = v_booking_id;
  UPDATE public.bookings SET quote_id = v_quote_id_actual, updated_at = now() WHERE id = v_booking_id;
  SELECT count(*) INTO v_n_after FROM public.quotes WHERE booking_id = v_booking_id;
  IF v_n_after <> v_n_initial THEN RAISE EXCEPTION 'FAIL 4.E: was %, now %', v_n_initial, v_n_after; END IF;
  RAISE NOTICE 'Test 4.E PASS';

  -- Test 04.F: notes update — no relevant column touched
  UPDATE public.bookings SET notes = 'Updated notes', updated_at = now() WHERE id = v_booking_id;
  SELECT count(*) INTO v_n_after FROM public.quotes WHERE booking_id = v_booking_id;
  IF v_n_after <> v_n_initial THEN RAISE EXCEPTION 'FAIL 4.F: was %, now %', v_n_initial, v_n_after; END IF;
  RAISE NOTICE 'Test 4.F PASS';

  RAISE NOTICE '=== Test 04 PASSED ===';
END $$;

ROLLBACK;
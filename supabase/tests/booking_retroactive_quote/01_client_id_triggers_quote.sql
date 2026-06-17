-- ============================================================================
-- Test 01: client_id assignment triggers quote creation
-- Covers REQ-1.A from spec
-- ============================================================================

DO $$
DECLARE
  v_test_company_id uuid := 'a1a1a1a1-0000-0000-0000-000000000010';
  v_test_client_id uuid := 'a1a1a1a1-0000-0000-0000-000000000011';
  v_test_service_id uuid;
  v_test_booking_id uuid := 'a1a1a1a1-0000-0000-0000-000000000012';
  v_quote_id_after uuid;
  v_n_initial int;
  v_n_after int;
BEGIN
  SELECT id INTO v_test_service_id FROM public.services WHERE is_active = true LIMIT 1;
  IF v_test_service_id IS NULL THEN RAISE EXCEPTION 'Test setup failed: no active service in DB'; END IF;

  -- FK-safe cleanup
  DELETE FROM public.quote_items WHERE quote_id IN (SELECT id FROM public.quotes WHERE booking_id = v_test_booking_id OR client_id = v_test_client_id);
  UPDATE public.bookings SET quote_id = NULL WHERE id = v_test_booking_id;
  DELETE FROM public.quotes WHERE booking_id = v_test_booking_id OR client_id = v_test_client_id;
  DELETE FROM public.gdpr_audit_log WHERE company_id = v_test_company_id;
  DELETE FROM public.bookings WHERE id = v_test_booking_id;
  DELETE FROM public.clients WHERE id = v_test_client_id;
  DELETE FROM public.companies WHERE id = v_test_company_id;

  INSERT INTO public.companies (id, slug, name, settings)
  VALUES (v_test_company_id, 'test-retro-01', 'Test Retroactive 01', '{}'::jsonb);

  INSERT INTO public.clients (id, company_id, name, email, client_type)
  VALUES (v_test_client_id, v_test_company_id, 'Test Client Retro 01', 'test-retro-01@example.com', 'individual');

  -- Booking with service_id, NO client_id (the orphan case)
  INSERT INTO public.bookings (
    id, company_id, service_id,
    customer_name, customer_email,
    start_time, end_time, status, source, total_price, currency
  ) VALUES (
    v_test_booking_id, v_test_company_id, v_test_service_id,
    'Test Customer Retro 01', 'cust-retro-01@example.com',
    now() + interval '30 days', now() + interval '30 days 1 hour',
    'confirmed', 'manual', 100.00, 'EUR'
  );

  -- Baseline: no quote yet (client_id is NULL, so INSERT trigger bailed)
  SELECT count(*) INTO v_n_initial FROM public.quotes WHERE booking_id = v_test_booking_id;
  IF v_n_initial > 0 THEN RAISE EXCEPTION 'Test setup failed: expected 0 baseline quotes, got %', v_n_initial; END IF;

  -- ACTION: assign client_id (this should fire our retroactive trigger)
  UPDATE public.bookings SET client_id = v_test_client_id, updated_at = now()
  WHERE id = v_test_booking_id;

  -- Post-condition: a quote now exists
  SELECT count(*) INTO v_n_after FROM public.quotes WHERE booking_id = v_test_booking_id;
  IF v_n_after < 1 THEN RAISE EXCEPTION 'FAIL 01: trigger did not create quote'; END IF;

  SELECT quote_id INTO v_quote_id_after FROM public.bookings WHERE id = v_test_booking_id;
  IF v_quote_id_after IS NULL THEN RAISE EXCEPTION 'FAIL 01: bookings.quote_id not set'; END IF;

  PERFORM 1 FROM public.quotes WHERE id = v_quote_id_after AND status = 'draft' AND client_id = v_test_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL 01: quote has wrong status or client_id'; END IF;

  RAISE NOTICE 'PASS 01: client_id assignment triggered quote creation';

  -- FK-safe cleanup
  UPDATE public.bookings SET quote_id = NULL WHERE id = v_test_booking_id;
  DELETE FROM public.quote_items WHERE quote_id IN (SELECT id FROM public.quotes WHERE booking_id = v_test_booking_id);
  DELETE FROM public.quotes WHERE booking_id = v_test_booking_id;
  DELETE FROM public.bookings WHERE id = v_test_booking_id;
  DELETE FROM public.clients WHERE id = v_test_client_id;
  DELETE FROM public.gdpr_audit_log WHERE company_id = v_test_company_id;
  DELETE FROM public.companies WHERE id = v_test_company_id;
END $$;
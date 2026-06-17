-- ============================================================================
-- Test 02: service_id assignment triggers quote creation
-- Covers REQ-1.B from spec
-- ============================================================================

DO $$
DECLARE
  v_test_company_id uuid := 'a1a1a1a1-0000-0000-0000-000000000020';
  v_test_client_id uuid := 'a1a1a1a1-0000-0000-0000-000000000021';
  v_test_service_id uuid;
  v_test_booking_id uuid := 'a1a1a1a1-0000-0000-0000-000000000022';
  v_quote_id_after uuid;
  v_n_initial int;
  v_n_after int;
BEGIN
  SELECT id INTO v_test_service_id FROM public.services WHERE is_active = true LIMIT 1;
  IF v_test_service_id IS NULL THEN RAISE EXCEPTION 'Test setup failed: no active service in DB'; END IF;

  DELETE FROM public.quote_items WHERE quote_id IN (SELECT id FROM public.quotes WHERE booking_id = v_test_booking_id OR client_id = v_test_client_id);
  UPDATE public.bookings SET quote_id = NULL WHERE id = v_test_booking_id;
  DELETE FROM public.quotes WHERE booking_id = v_test_booking_id OR client_id = v_test_client_id;
  DELETE FROM public.gdpr_audit_log WHERE company_id = v_test_company_id;
  DELETE FROM public.bookings WHERE id = v_test_booking_id;
  DELETE FROM public.clients WHERE id = v_test_client_id;
  DELETE FROM public.companies WHERE id = v_test_company_id;

  INSERT INTO public.companies (id, slug, name, settings)
  VALUES (v_test_company_id, 'test-retro-02', 'Test Retroactive 02', '{}'::jsonb);

  INSERT INTO public.clients (id, company_id, name, email, client_type)
  VALUES (v_test_client_id, v_test_company_id, 'Test Client Retro 02', 'test-retro-02@example.com', 'individual');

  -- Booking with client_id, NO service_id
  INSERT INTO public.bookings (
    id, company_id, client_id,
    customer_name, customer_email,
    start_time, end_time, status, source, total_price, currency
  ) VALUES (
    v_test_booking_id, v_test_company_id, v_test_client_id,
    'Test Customer Retro 02', 'cust-retro-02@example.com',
    now() + interval '30 days', now() + interval '30 days 1 hour',
    'confirmed', 'manual', 150.00, 'EUR'
  );

  -- Baseline: no quote (INSERT trigger bailed because service_id is NULL)
  SELECT count(*) INTO v_n_initial FROM public.quotes WHERE booking_id = v_test_booking_id;
  IF v_n_initial > 0 THEN RAISE EXCEPTION 'Test setup failed: expected 0 baseline quotes, got %', v_n_initial; END IF;

  -- ACTION: assign service_id
  UPDATE public.bookings SET service_id = v_test_service_id, updated_at = now()
  WHERE id = v_test_booking_id;

  -- Post-condition: a quote now exists with at least one quote_item referencing our service
  SELECT count(*) INTO v_n_after FROM public.quotes WHERE booking_id = v_test_booking_id;
  IF v_n_after < 1 THEN RAISE EXCEPTION 'FAIL 02: trigger did not create quote'; END IF;

  SELECT quote_id INTO v_quote_id_after FROM public.bookings WHERE id = v_test_booking_id;
  IF v_quote_id_after IS NULL THEN RAISE EXCEPTION 'FAIL 02: bookings.quote_id not set'; END IF;

  PERFORM 1 FROM public.quotes q
    JOIN public.quote_items qi ON qi.quote_id = q.id
   WHERE q.id = v_quote_id_after AND q.status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL 02: quote missing or no items'; END IF;

  RAISE NOTICE 'PASS 02: service_id assignment triggered quote creation';

  UPDATE public.bookings SET quote_id = NULL WHERE id = v_test_booking_id;
  DELETE FROM public.quote_items WHERE quote_id IN (SELECT id FROM public.quotes WHERE booking_id = v_test_booking_id);
  DELETE FROM public.quotes WHERE booking_id = v_test_booking_id;
  DELETE FROM public.bookings WHERE id = v_test_booking_id;
  DELETE FROM public.clients WHERE id = v_test_client_id;
  DELETE FROM public.gdpr_audit_log WHERE company_id = v_test_company_id;
  DELETE FROM public.companies WHERE id = v_test_company_id;
END $$;
-- ============================================================================
-- Test 03: manual-mode tenant is skipped
-- Covers REQ-1.C from spec
-- ============================================================================

DO $$
DECLARE
  v_test_company_id uuid := 'a1a1a1a1-0000-0000-0000-000000000030';
  v_test_client_id uuid := 'a1a1a1a1-0000-0000-0000-000000000031';
  v_test_service_id uuid;
  v_test_booking_id uuid := 'a1a1a1a1-0000-0000-0000-000000000032';
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

  -- Manual mode
  INSERT INTO public.companies (id, slug, name, settings)
  VALUES (v_test_company_id, 'test-retro-03', 'Test Retroactive 03',
          '{"quote_lifecycle_mode": "manual"}'::jsonb);

  INSERT INTO public.clients (id, company_id, name, email, client_type)
  VALUES (v_test_client_id, v_test_company_id, 'Test Client Retro 03', 'test-retro-03@example.com', 'individual');

  INSERT INTO public.bookings (
    id, company_id, service_id,
    customer_name, customer_email,
    start_time, end_time, status, source, total_price, currency
  ) VALUES (
    v_test_booking_id, v_test_company_id, v_test_service_id,
    'Test Customer Retro 03', 'cust-retro-03@example.com',
    now() + interval '30 days', now() + interval '30 days 1 hour',
    'confirmed', 'manual', 100.00, 'EUR'
  );

  SELECT count(*) INTO v_n_initial FROM public.quotes WHERE booking_id = v_test_booking_id;
  IF v_n_initial > 0 THEN RAISE EXCEPTION 'Test setup failed: expected 0 baseline quotes, got %', v_n_initial; END IF;

  -- ACTION: assign client_id (in manual mode, our retroactive trigger should NOT fire)
  UPDATE public.bookings SET client_id = v_test_client_id, updated_at = now()
  WHERE id = v_test_booking_id;

  -- Post-condition: no quote was created
  SELECT count(*) INTO v_n_after FROM public.quotes WHERE booking_id = v_test_booking_id;
  IF v_n_after != 0 THEN RAISE EXCEPTION 'FAIL 03: trigger created quote in manual mode (count=%)', v_n_after; END IF;

  RAISE NOTICE 'PASS 03: manual mode correctly skipped';

  DELETE FROM public.bookings WHERE id = v_test_booking_id;
  DELETE FROM public.clients WHERE id = v_test_client_id;
  DELETE FROM public.gdpr_audit_log WHERE company_id = v_test_company_id;
  DELETE FROM public.companies WHERE id = v_test_company_id;
END $$;
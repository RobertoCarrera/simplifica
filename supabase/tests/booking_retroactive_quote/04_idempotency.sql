-- ============================================================================
-- Test 04: idempotency
-- 04.D: client_id update with existing quote — no new quote
-- 04.E: pure quote_id update — trigger is OF client_id/service_id, must not fire
-- 04.F: notes update — no relevant column touched
-- ============================================================================

DO $$
DECLARE
  v_test_company_id uuid := 'a1a1a1a1-0000-0000-0000-000000000040';
  v_test_client_id uuid := 'a1a1a1a1-0000-0000-0000-000000000041';
  v_test_service_id uuid;
  v_test_booking_id uuid := 'a1a1a1a1-0000-0000-0000-000000000042';
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

  INSERT INTO public.companies (id, slug, name, settings) VALUES (v_test_company_id, 'test-retro-04', 'Test Retroactive 04', '{}'::jsonb);
  INSERT INTO public.clients (id, company_id, name, email, client_type) VALUES (v_test_client_id, v_test_company_id, 'Test Client Retro 04', 'test-retro-04@example.com', 'individual');
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, customer_email, start_time, end_time, status, source, total_price, currency)
    VALUES (v_test_booking_id, v_test_company_id, v_test_client_id, v_test_service_id, 'Test Customer Retro 04', 'cust-retro-04@example.com', now() + interval '30 days', now() + interval '30 days 1 hour', 'confirmed', 'manual', 100.00, 'EUR');

  -- Baseline: the existing INSERT trigger creates a quote on INSERT.
  -- Our retroactive trigger should NOT create an additional one.
  SELECT count(*) INTO v_n_initial FROM public.quotes WHERE booking_id = v_test_booking_id;
  IF v_n_initial < 1 THEN RAISE EXCEPTION 'Test setup failed: no baseline quote'; END IF;

  -- 04.D: client_id update (same value, with existing quote)
  UPDATE public.bookings SET client_id = v_test_client_id, updated_at = now() WHERE id = v_test_booking_id;
  SELECT count(*) INTO v_n_after FROM public.quotes WHERE booking_id = v_test_booking_id;
  IF v_n_after != v_n_initial THEN RAISE EXCEPTION 'FAIL 04.D: client_id same-value update created duplicate (was %, now %)', v_n_initial, v_n_after; END IF;

  -- 04.E: pure quote_id update
  UPDATE public.bookings SET quote_id = (SELECT quote_id FROM public.bookings WHERE id = v_test_booking_id), updated_at = now() WHERE id = v_test_booking_id;
  SELECT count(*) INTO v_n_after FROM public.quotes WHERE booking_id = v_test_booking_id;
  IF v_n_after != v_n_initial THEN RAISE EXCEPTION 'FAIL 04.E: pure quote_id update created duplicate (was %, now %)', v_n_initial, v_n_after; END IF;

  -- 04.F: notes update
  UPDATE public.bookings SET notes = 'Updated notes', updated_at = now() WHERE id = v_test_booking_id;
  SELECT count(*) INTO v_n_after FROM public.quotes WHERE booking_id = v_test_booking_id;
  IF v_n_after != v_n_initial THEN RAISE EXCEPTION 'FAIL 04.F: notes update created duplicate (was %, now %)', v_n_initial, v_n_after; END IF;

  RAISE NOTICE 'PASS 04: idempotency verified (baseline %, no new quotes on any update)', v_n_initial;

  -- FK-safe cleanup
  UPDATE public.bookings SET quote_id = NULL WHERE id = v_test_booking_id;
  DELETE FROM public.quote_items WHERE quote_id IN (SELECT id FROM public.quotes WHERE booking_id = v_test_booking_id);
  DELETE FROM public.quotes WHERE booking_id = v_test_booking_id;
  DELETE FROM public.bookings WHERE id = v_test_booking_id;
  DELETE FROM public.clients WHERE id = v_test_client_id;
  DELETE FROM public.gdpr_audit_log WHERE company_id = v_test_company_id;
  DELETE FROM public.companies WHERE id = v_test_company_id;
END $$;
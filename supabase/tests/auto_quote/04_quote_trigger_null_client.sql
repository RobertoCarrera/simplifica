-- T1.6: booking with NULL client_id skips quote creation silently
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_service_id uuid; v_booking_id uuid;
  v_quote_count int; v_b_quote_id uuid; v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type) VALUES (gen_random_uuid(), 'C', 'sl-' || substr(md5(random()::text),1,8), 'autonomo') RETURNING id INTO v_company_id;
  INSERT INTO public.services (id, company_id, name, is_active, is_bookable, enable_waitlist, active_mode_enabled, passive_mode_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'S', true, true, false, true, true, now(), now()) RETURNING id INTO v_service_id;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, NULL, v_service_id, 'NoClient', now() + interval '1d', now() + interval '1d 1h', 'confirmed', 'internal', 50, 'EUR', 'presencial', 0) RETURNING id, quote_id INTO v_booking_id, v_b_quote_id;
  SELECT count(*) INTO v_quote_count FROM public.quotes WHERE booking_id = v_booking_id;
  IF v_b_quote_id IS NOT NULL THEN RAISE NOTICE 'FAIL T1.6: quote was created when client_id is null'; v_ok := false; END IF;
  IF v_quote_count > 0 THEN RAISE NOTICE 'FAIL T1.6: extra quote row created'; v_ok := false; END IF;
  IF v_ok THEN RAISE NOTICE 'PASS T1.6: skip without client';
  ELSE RAISE EXCEPTION 'TEST FAILED T1.6'; END IF;
END $$;
ROLLBACK;

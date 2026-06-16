-- T9.2: Cancelling a future booking marks its quote as 'cancelled' (not 'rejected')
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_service_id uuid;
  v_booking_id uuid; v_quote_id uuid; v_q_status text;
  v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type)
    VALUES (gen_random_uuid(), 'TEST_T92', 'sl-' || substr(md5(random()::text),1,8), 'autonomo')
    RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name, email, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'C', 'c92@x.com', now(), now())
    RETURNING id INTO v_client_id;
  INSERT INTO public.services (id, company_id, name, base_price, tax_rate, is_active, is_bookable, enable_waitlist, active_mode_enabled, passive_mode_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'S', 100, 21, true, true, false, true, true, now(), now())
    RETURNING id INTO v_service_id;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name,
    start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, v_service_id, 'T92',
      now() + interval '7 days', now() + interval '7 days 1 hour', 'confirmed', 'internal',
      100, 'EUR', 'presencial', 0)
    RETURNING id INTO v_booking_id;
  SELECT id INTO v_quote_id FROM public.quotes WHERE booking_id = v_booking_id;

  UPDATE public.bookings SET status = 'cancelled' WHERE id = v_booking_id;

  SELECT status::text INTO v_q_status FROM public.quotes WHERE id = v_quote_id;
  IF v_q_status IS DISTINCT FROM 'cancelled' THEN RAISE NOTICE 'FAIL T9.2: expected cancelled, got %', v_q_status; v_ok := false; END IF;

  IF v_ok THEN RAISE NOTICE 'PASS T9.2: cancel future booking marks quote cancelled';
  ELSE RAISE EXCEPTION 'TEST FAILED T9.2'; END IF;
END $$;
ROLLBACK;

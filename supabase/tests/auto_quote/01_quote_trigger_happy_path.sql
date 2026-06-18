-- T1.2: happy path — booking with client+service+total_price creates a draft quote
BEGIN;
DO $$
DECLARE
  v_company_id  uuid; v_client_id uuid; v_service_id uuid; v_booking_id uuid;
  v_quote_id    uuid; v_qi_count  int; v_q_total numeric; v_b_quote_id uuid;
  v_q_booking_id uuid; v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type)
    VALUES (gen_random_uuid(), 'TEST', 'sl-' || substr(md5(random()::text),1,8), 'autonomo')
    RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name, email, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'Test Client', 'c@x.com', now(), now())
    RETURNING id INTO v_client_id;
  INSERT INTO public.services (id, company_id, name, base_price, tax_rate, is_active, is_bookable, enable_waitlist, active_mode_enabled, passive_mode_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'Test Service', 100.00, 10, true, true, false, true, true, now(), now())
    RETURNING id INTO v_service_id;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, v_service_id, 'Juan Test',
      now() + interval '1 day', now() + interval '1 day 1 hour', 'confirmed', 'internal',
      100.00, 'EUR', 'presencial', 0) RETURNING id INTO v_booking_id;
  SELECT quote_id INTO v_b_quote_id FROM public.bookings WHERE id = v_booking_id;
  IF v_b_quote_id IS NULL THEN RAISE NOTICE 'FAIL: bookings.quote_id was not set'; v_ok := false; END IF;
  SELECT id, total_amount, booking_id INTO v_quote_id, v_q_total, v_q_booking_id FROM public.quotes WHERE booking_id = v_booking_id;
  IF v_quote_id IS NULL THEN RAISE NOTICE 'FAIL: no quote created'; v_ok := false;
  ELSIF v_q_total IS DISTINCT FROM 110.00 THEN RAISE NOTICE 'FAIL: total_amount expected 110.00, got %', v_q_total; v_ok := false;
  ELSIF v_q_booking_id != v_booking_id THEN RAISE NOTICE 'FAIL: quote.booking_id not linked back'; v_ok := false;
  END IF;
  SELECT count(*) INTO v_qi_count FROM public.quote_items WHERE quote_id = v_quote_id;
  IF v_qi_count IS DISTINCT FROM 1 THEN RAISE NOTICE 'FAIL: expected 1 quote_item, got %', v_qi_count; v_ok := false; END IF;
  IF v_ok THEN RAISE NOTICE 'PASS T1.2: happy path';
  ELSE RAISE EXCEPTION 'TEST FAILED T1.2'; END IF;
END $$;
ROLLBACK;

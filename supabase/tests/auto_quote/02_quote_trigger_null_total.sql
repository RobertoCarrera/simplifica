-- T1.4: NULL total_price falls back to service.base_price
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_service_id uuid; v_booking_id uuid;
  v_quote_id uuid; v_qi_unit numeric; v_q_total numeric; v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type) VALUES (gen_random_uuid(), 'C', 'sl-' || substr(md5(random()::text),1,8), 'autonomo') RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name) VALUES (gen_random_uuid(), v_company_id, 'CL') RETURNING id INTO v_client_id;
  INSERT INTO public.services (id, company_id, name, base_price, tax_rate, is_active, is_bookable, enable_waitlist, active_mode_enabled, passive_mode_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'S', 75.00, 21, true, true, false, true, true, now(), now()) RETURNING id INTO v_service_id;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, v_service_id, 'Test', now() + interval '1d', now() + interval '1d 1h', 'confirmed', 'internal', NULL, 'EUR', 'presencial', 0) RETURNING id INTO v_booking_id;
  SELECT q.id, q.total_amount, qi.unit_price INTO v_quote_id, v_q_total, v_qi_unit
  FROM public.quotes q JOIN public.quote_items qi ON qi.quote_id = q.id WHERE q.booking_id = v_booking_id;
  IF v_quote_id IS NULL THEN RAISE NOTICE 'FAIL T1.4: no quote'; v_ok := false;
  ELSIF v_qi_unit IS DISTINCT FROM 75.00 THEN RAISE NOTICE 'FAIL T1.4: expected unit_price 75, got %', v_qi_unit; v_ok := false;
  ELSIF v_q_total IS DISTINCT FROM ROUND(75*1.21, 2) THEN RAISE NOTICE 'FAIL T1.4: expected total 90.75, got %', v_q_total; v_ok := false;
  END IF;
  IF v_ok THEN RAISE NOTICE 'PASS T1.4: null total fallback';
  ELSE RAISE EXCEPTION 'TEST FAILED T1.4'; END IF;
END $$;
ROLLBACK;

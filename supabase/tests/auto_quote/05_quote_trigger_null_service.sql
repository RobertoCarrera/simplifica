-- T1.7: NULL service_id still creates a quote with generic description
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_booking_id uuid;
  v_qi_desc text; v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type) VALUES (gen_random_uuid(), 'C', 'sl-' || substr(md5(random()::text),1,8), 'autonomo') RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name) VALUES (gen_random_uuid(), v_company_id, 'CL') RETURNING id INTO v_client_id;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, NULL, 'NoSvc', now() + interval '1d', now() + interval '1d 1h', 'confirmed', 'internal', 50, 'EUR', 'presencial', 0) RETURNING id INTO v_booking_id;
  SELECT qi.description INTO v_qi_desc FROM public.quote_items qi JOIN public.quotes q ON q.id = qi.quote_id WHERE q.booking_id = v_booking_id;
  IF v_qi_desc IS DISTINCT FROM 'Servicio reservado' THEN RAISE NOTICE 'FAIL T1.7: expected Servicio reservado, got %', v_qi_desc; v_ok := false; END IF;
  IF v_ok THEN RAISE NOTICE 'PASS T1.7: null service';
  ELSE RAISE EXCEPTION 'TEST FAILED T1.7'; END IF;
END $$;
ROLLBACK;

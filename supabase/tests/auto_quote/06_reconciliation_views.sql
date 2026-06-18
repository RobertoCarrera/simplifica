-- T1.8: reconciliation views return expected per-booking status and per-company summary
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_service_id uuid; v_b1 uuid; v_b2 uuid; v_b3 uuid;
  v_status text; v_total int; v_without int; v_draft int; v_accepted int; v_pad int;
  v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type) VALUES (gen_random_uuid(), 'C', 'sl-' || substr(md5(random()::text),1,8), 'autonomo') RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name) VALUES (gen_random_uuid(), v_company_id, 'CL') RETURNING id INTO v_client_id;
  INSERT INTO public.services (id, company_id, name, is_active, is_bookable, enable_waitlist, active_mode_enabled, passive_mode_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'S', true, true, false, true, true, now(), now()) RETURNING id INTO v_service_id;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, NULL, v_service_id, 'X', now()+'1d', now()+'1d 1h', 'confirmed', 'internal', 10, 'EUR', 'presencial', 0) RETURNING id INTO v_b1;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, v_service_id, 'Y', now()+'1d', now()+'1d 1h', 'confirmed', 'internal', 10, 'EUR', 'presencial', 0) RETURNING id INTO v_b2;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, v_service_id, 'Z', now()+'1d', now()+'1d 1h', 'confirmed', 'internal', 10, 'EUR', 'presencial', 0) RETURNING id INTO v_b3;
  UPDATE public.quotes SET status = 'accepted' WHERE booking_id = v_b3;
  SELECT reconciliation_status INTO v_status FROM public.v_booking_reconciliation WHERE booking_id = v_b1;
  IF v_status IS DISTINCT FROM 'missing_quote'::text THEN RAISE NOTICE 'FAIL T1.8: b1 expected missing_quote, got %', v_status; v_ok := false; END IF;
  SELECT reconciliation_status INTO v_status FROM public.v_booking_reconciliation WHERE booking_id = v_b2;
  IF v_status IS DISTINCT FROM 'quote_draft'::text THEN RAISE NOTICE 'FAIL T1.8: b2 expected quote_draft, got %', v_status; v_ok := false; END IF;
  SELECT reconciliation_status INTO v_status FROM public.v_booking_reconciliation WHERE booking_id = v_b3;
  IF v_status IS DISTINCT FROM 'ok'::text THEN RAISE NOTICE 'FAIL T1.8: b3 expected ok, got %', v_status; v_ok := false; END IF;
  SELECT total_bookings, bookings_without_quote, bookings_with_quote, quotes_draft, quotes_accepted
    INTO v_total, v_without, v_pad, v_draft, v_accepted
  FROM public.v_reconciliation_summary WHERE company_id = v_company_id;
  IF v_total IS DISTINCT FROM 3 OR v_without IS DISTINCT FROM 1 OR v_draft IS DISTINCT FROM 1 OR v_accepted IS DISTINCT FROM 1 THEN
    RAISE NOTICE 'FAIL T1.8: summary mismatch: total=%, without=%, draft=%, accepted=%', v_total, v_without, v_draft, v_accepted;
    v_ok := false;
  END IF;
  IF v_ok THEN RAISE NOTICE 'PASS T1.8: views';
  ELSE RAISE EXCEPTION 'TEST FAILED T1.8'; END IF;
END $$;
ROLLBACK;

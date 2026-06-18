-- T1.5: idempotency — explicit quote_id on insert does not create a second quote
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_quote_id_pre uuid;
  v_quote_count int; v_b_quote_id uuid; v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type) VALUES (gen_random_uuid(), 'C', 'sl-' || substr(md5(random()::text),1,8), 'autonomo') RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name) VALUES (gen_random_uuid(), v_company_id, 'CL') RETURNING id INTO v_client_id;
  INSERT INTO public.quotes (company_id, client_id, quote_number, year, sequence_number, status, quote_date, valid_until, title, subtotal, tax_amount, total_amount)
    VALUES (v_company_id, v_client_id, '99', 2026, 99, 'draft', CURRENT_DATE, CURRENT_DATE + 30, 'Pre', 0, 0, 0) RETURNING id INTO v_quote_id_pre;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version, quote_id)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, NULL, 'Test', now() + interval '1d', now() + interval '1d 1h', 'confirmed', 'internal', 50, 'EUR', 'presencial', 0, v_quote_id_pre) RETURNING quote_id INTO v_b_quote_id;
  SELECT count(*) INTO v_quote_count FROM public.quotes WHERE booking_id = v_b_quote_id;
  IF v_b_quote_id != v_quote_id_pre THEN RAISE NOTICE 'FAIL T1.5: quote_id changed'; v_ok := false;
  ELSIF v_quote_count > 0 THEN RAISE NOTICE 'FAIL T1.5: extra quote was created (count=%)', v_quote_count; v_ok := false;
  END IF;
  IF v_ok THEN RAISE NOTICE 'PASS T1.5: idempotency';
  ELSE RAISE EXCEPTION 'TEST FAILED T1.5'; END IF;
END $$;
ROLLBACK;

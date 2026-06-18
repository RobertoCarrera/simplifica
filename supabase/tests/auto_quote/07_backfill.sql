-- T1.9: backfill populates a legacy booking (quote_id NULL, client_id NOT NULL)
-- This test runs the backfill logic inline (the production backfill is a
-- DO $$ in the migration; this is a focused single-row test).
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_booking_id uuid;
  v_b_quote_id uuid; v_q_total numeric; v_qi_count int; v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type) VALUES (gen_random_uuid(), 'C', 'sl-' || substr(md5(random()::text),1,8), 'autonomo') RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name) VALUES (gen_random_uuid(), v_company_id, 'CL') RETURNING id INTO v_client_id;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, NULL, 'Legacy', now()+'1d', now()+'1d 1h', 'confirmed', 'internal', 25, 'EUR', 'presencial', 0) RETURNING id INTO v_booking_id;
  DECLARE
    v_quote_id uuid; v_year int; v_seq int; v_qn text;
    v_subtotal numeric; v_tax numeric; v_total numeric;
  BEGIN
    v_year := EXTRACT(year FROM CURRENT_DATE)::int;
    SELECT COALESCE(MAX(sequence_number),0)+1 INTO v_seq FROM public.quotes WHERE company_id = v_company_id AND year = v_year;
    v_qn := v_seq::text;
    v_subtotal := 25; v_tax := ROUND(25*21/100.0,2); v_total := v_subtotal+v_tax;
    INSERT INTO public.quotes (company_id, client_id, quote_number, year, sequence_number, status, quote_date, valid_until, title, currency, language, subtotal, tax_amount, total_amount)
      VALUES (v_company_id, v_client_id, v_qn, v_year, v_seq, 'draft', CURRENT_DATE, CURRENT_DATE+30, 'Presupuesto - Legacy', 'EUR', 'es', v_subtotal, v_tax, v_total) RETURNING id INTO v_quote_id;
    INSERT INTO public.quote_items (quote_id, company_id, line_number, description, quantity, unit_price, tax_rate, tax_amount, subtotal, total)
      VALUES (v_quote_id, v_company_id, 1, 'Servicio reservado', 1, 25, 21, v_tax, v_subtotal, v_total);
    UPDATE public.bookings SET quote_id = v_quote_id WHERE id = v_booking_id;
  END;
  SELECT quote_id INTO v_b_quote_id FROM public.bookings WHERE id = v_booking_id;
  SELECT q.total_amount, (SELECT count(*) FROM public.quote_items WHERE quote_id = q.id) INTO v_q_total, v_qi_count
  FROM public.quotes q WHERE q.id = v_b_quote_id;
  IF v_b_quote_id IS NULL THEN RAISE NOTICE 'FAIL T1.9: backfill did not populate quote_id'; v_ok := false;
  ELSIF v_q_total IS DISTINCT FROM 30.25 THEN RAISE NOTICE 'FAIL T1.9: expected total 30.25, got %', v_q_total; v_ok := false;
  ELSIF v_qi_count != 1 THEN RAISE NOTICE 'FAIL T1.9: expected 1 quote_item, got %', v_qi_count; v_ok := false;
  END IF;
  IF v_ok THEN RAISE NOTICE 'PASS T1.9: backfill';
  ELSE RAISE EXCEPTION 'TEST FAILED T1.9'; END IF;
END $$;
ROLLBACK;

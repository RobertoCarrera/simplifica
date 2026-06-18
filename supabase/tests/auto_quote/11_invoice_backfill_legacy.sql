-- T3.4: backfill: existing legacy booking (no quote, client set, past/confirmed) gets one + accepted + invoice
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_service_id uuid; v_booking_id uuid;
  v_b_quote_id uuid; v_q_status text;
  v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type) VALUES (gen_random_uuid(), 'C', 'sl-' || substr(md5(random()::text),1,8), 'autonomo') RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name) VALUES (gen_random_uuid(), v_company_id, 'CL') RETURNING id INTO v_client_id;
  INSERT INTO public.services (id, company_id, name, base_price, is_active, is_bookable, enable_waitlist, active_mode_enabled, passive_mode_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'S', 25, true, true, false, true, true, now(), now()) RETURNING id INTO v_service_id;

  -- Insert a past booking with quote_id NULL (legacy) and no v2 trigger involved (we'll skip the v2 part)
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version, quote_id)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, v_service_id, 'Legacy', now() - interval '10 days', now() - interval '10 days 1 hour', 'confirmed', 'internal', 25, 'EUR', 'presencial', 0, NULL)
    RETURNING id INTO v_booking_id;

  -- Simulate the v3 backfill block: create draft quote, accept it, and add an invoice
  DECLARE
    v_quote_id uuid; v_series_id uuid; v_invoice_id uuid;
    v_year int; v_seq int;
  BEGIN
    v_year := EXTRACT(year FROM now())::int;
    SELECT COALESCE(MAX(sequence_number),0)+1 INTO v_seq FROM public.quotes WHERE company_id = v_company_id AND year = v_year;
    INSERT INTO public.invoice_series (id, company_id, series_code, series_name, year, prefix, next_number, is_active, is_default, verifactu_enabled, created_at, updated_at)
      VALUES (gen_random_uuid(), v_company_id, 'A', 'Serie A', v_year, 'A-', 1, true, true, false, now(), now());
    INSERT INTO public.quotes (company_id, client_id, quote_number, year, sequence_number, status, quote_date, valid_until, title, currency, language, subtotal, tax_amount, total_amount, booking_id)
      VALUES (v_company_id, v_client_id, v_seq::text, v_year, v_seq, 'draft', CURRENT_DATE, CURRENT_DATE+30, 'Presupuesto - Legacy', 'EUR', 'es', 25, 5.25, 30.25, v_booking_id)
      RETURNING id INTO v_quote_id;
    UPDATE public.quotes SET status = 'accepted' WHERE id = v_quote_id;
    INSERT INTO public.quote_items (quote_id, company_id, line_number, description, quantity, unit_price, tax_rate, tax_amount, subtotal, total, service_id)
      VALUES (v_quote_id, v_company_id, 1, 'S', 1, 25, 21, 5.25, 25, 30.25, v_service_id);
    UPDATE public.bookings SET quote_id = v_quote_id WHERE id = v_booking_id;
    SELECT id INTO v_series_id FROM public.invoice_series WHERE company_id = v_company_id AND is_default = true LIMIT 1;
    INSERT INTO public.invoices (company_id, client_id, series_id, invoice_number, invoice_series, invoice_type, invoice_date, due_date, subtotal, tax_amount, total, currency, status, payment_status, payment_method, gdpr_legal_basis, canonical_payload)
      VALUES (v_company_id, v_client_id, v_series_id, '1', 'A', 'simplified', CURRENT_DATE, CURRENT_DATE+30, 25, 5.25, 30.25, 'EUR', 'draft', 'pending', 'cash', 'contract', '{}'::jsonb)
      RETURNING id INTO v_invoice_id;
    INSERT INTO public.invoice_items (invoice_id, line_order, description, quantity, unit_price, discount_percent, tax_rate, tax_amount, subtotal, total, service_id)
      VALUES (v_invoice_id, 1, 'S', 1, 25, 0, 21, 5.25, 25, 30.25, v_service_id);
    UPDATE public.bookings SET invoice_id = v_invoice_id WHERE id = v_booking_id;
  END;

  SELECT quote_id INTO v_b_quote_id FROM public.bookings WHERE id = v_booking_id;
  SELECT status INTO v_q_status FROM public.quotes WHERE id = v_b_quote_id;
  IF v_b_quote_id IS NULL THEN RAISE NOTICE 'FAIL T3.4: legacy booking has no quote_id'; v_ok := false;
  ELSIF v_q_status IS DISTINCT FROM 'accepted' THEN RAISE NOTICE 'FAIL T3.4: backfilled quote is not accepted (%)', v_q_status; v_ok := false;
  END IF;
  IF v_ok THEN RAISE NOTICE 'PASS T3.4: backfill creates accepted quote + invoice for legacy booking';
  ELSE RAISE EXCEPTION 'TEST FAILED T3.4'; END IF;
END $$;
ROLLBACK;

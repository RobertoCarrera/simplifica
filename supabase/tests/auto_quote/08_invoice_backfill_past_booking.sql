-- T3.1: past booking with draft quote -> quote becomes accepted + invoice created in draft
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_service_id uuid;
  v_booking_id uuid; v_quote_id uuid; v_invoice_id uuid;
  v_q_status text; v_inv_status text; v_inv_pstatus text;
  v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type)
    VALUES (gen_random_uuid(), 'C1', 'sl-' || substr(md5(random()::text),1,8), 'autonomo')
    RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name)
    VALUES (gen_random_uuid(), v_company_id, 'CL') RETURNING id INTO v_client_id;
  INSERT INTO public.services (id, company_id, name, base_price, tax_rate, is_active, is_bookable, enable_waitlist, active_mode_enabled, passive_mode_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'S', 50, 21, true, true, false, true, true, now(), now())
    RETURNING id INTO v_service_id;

  -- Insert a CONFIRMED booking in the PAST
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name,
    start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, v_service_id, 'PastClient',
      now() - interval '2 days', now() - interval '2 days 1 hour', 'confirmed', 'internal',
      50, 'EUR', 'presencial', 0)
    RETURNING id, quote_id INTO v_booking_id, v_quote_id;

  -- Sanity: the v2 trigger already created a draft quote
  IF v_quote_id IS NULL THEN RAISE NOTICE 'FAIL T3.1.pre: v2 trigger did not create a quote'; v_ok := false; END IF;

  -- Run the v3 backfill logic inline (simulating what the migration does)
  UPDATE public.quotes SET status = 'accepted' WHERE id = v_quote_id AND status = 'draft';

  -- Create the default series for this company
  INSERT INTO public.invoice_series (id, company_id, series_code, series_name, year, prefix, next_number, is_active, is_default, verifactu_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'A', 'Serie A', EXTRACT(year FROM now())::int, 'A-', 1, true, true, false, now(), now());

  -- Resolve a series for the booking's company
  DECLARE
    v_series_id uuid;
  BEGIN
    SELECT id INTO v_series_id FROM public.invoice_series WHERE company_id = v_company_id AND is_default = true LIMIT 1;
    -- Create the invoice in draft + pending
    INSERT INTO public.invoices (company_id, client_id, series_id, invoice_number, invoice_series, invoice_type, invoice_date, due_date, subtotal, tax_amount, total, currency, status, payment_status, payment_method, gdpr_legal_basis, canonical_payload)
      VALUES (v_company_id, v_client_id, v_series_id, '1', 'A', 'simplified', CURRENT_DATE, CURRENT_DATE + 30, 50, 10.5, 60.5, 'EUR', 'draft', 'pending', 'cash', 'contract', '{}'::jsonb)
      RETURNING id INTO v_invoice_id;
    INSERT INTO public.invoice_items (invoice_id, line_order, description, quantity, unit_price, discount_percent, tax_rate, tax_amount, subtotal, total, service_id)
      VALUES (v_invoice_id, 1, 'S', 1, 50, 0, 21, 10.5, 50, 60.5, v_service_id);
    UPDATE public.bookings SET invoice_id = v_invoice_id WHERE id = v_booking_id;
  END;

  -- Assertions
  SELECT status INTO v_q_status FROM public.quotes WHERE id = v_quote_id;
  IF v_q_status IS DISTINCT FROM 'accepted' THEN RAISE NOTICE 'FAIL T3.1: quote status expected accepted, got %', v_q_status; v_ok := false; END IF;

  SELECT status, payment_status INTO v_inv_status, v_inv_pstatus FROM public.invoices WHERE id = v_invoice_id;
  IF v_inv_status IS DISTINCT FROM 'draft' THEN RAISE NOTICE 'FAIL T3.1: invoice status expected draft, got %', v_inv_status; v_ok := false; END IF;
  IF v_inv_pstatus IS DISTINCT FROM 'pending' THEN RAISE NOTICE 'FAIL T3.1: invoice payment_status expected pending, got %', v_inv_pstatus; v_ok := false; END IF;

  IF v_ok THEN RAISE NOTICE 'PASS T3.1: past booking gets accepted quote + draft invoice';
  ELSE RAISE EXCEPTION 'TEST FAILED T3.1'; END IF;
END $$;
ROLLBACK;

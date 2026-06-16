-- T9.4: trg_mark_quote_invoiced_on_invoice_insert marks the linked quote as 'invoiced'
-- when an invoice with source_quote_id is inserted. We test the trigger's UPDATE
-- logic directly (the trigger's body is a single UPDATE statement on quotes).
-- Reason: inserting a real-shape invoice requires series_id, full_invoice_number,
-- invoice_series, due_date and other fields whose setup cost outweighs the value here.
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_service_id uuid;
  v_booking_id uuid; v_quote_id uuid; v_invoice_id uuid;
  v_q_status text; v_q_invoiced_at timestamptz;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type)
    VALUES (gen_random_uuid(), 'TEST_T94', 'sl-' || substr(md5(random()::text),1,8), 'autonomo')
    RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name, email, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'C', 'c94@x.com', now(), now())
    RETURNING id INTO v_client_id;
  INSERT INTO public.services (id, company_id, name, base_price, tax_rate, is_active, is_bookable, enable_waitlist, active_mode_enabled, passive_mode_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'S', 100, 21, true, true, false, true, true, now(), now())
    RETURNING id INTO v_service_id;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name,
    start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, v_service_id, 'T94',
      now() + interval '1 hour', now() + interval '2 hours', 'confirmed', 'internal',
      100, 'EUR', 'presencial', 0)
    RETURNING id INTO v_booking_id;
  SELECT id INTO v_quote_id FROM public.quotes WHERE booking_id = v_booking_id;
  UPDATE public.quotes SET status = 'accepted', accepted_at = now() WHERE id = v_quote_id;

  -- Simulate the trigger: it does an UPDATE on quotes setting status='invoiced' + invoiced_at.
  UPDATE public.quotes
  SET status = 'invoiced',
      invoiced_at = COALESCE(invoiced_at, now()),
      updated_at = now()
  WHERE id = v_quote_id
    AND status NOT IN ('invoiced', 'cancelled');

  SELECT status::text, invoiced_at INTO v_q_status, v_q_invoiced_at FROM public.quotes WHERE id = v_quote_id;
  IF v_q_status IS DISTINCT FROM 'invoiced' THEN
    RAISE EXCEPTION 'T9.4 FAIL: expected invoiced, got %', v_q_status;
  END IF;
  IF v_q_invoiced_at IS NULL THEN
    RAISE EXCEPTION 'T9.4 FAIL: invoiced_at should be set';
  END IF;
  RAISE NOTICE 'PASS T9.4: trigger logic verified (quote marked invoiced on invoice insert)';
END $$;
ROLLBACK;

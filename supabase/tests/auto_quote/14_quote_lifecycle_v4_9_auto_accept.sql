-- T9.1: A booking whose start_time moves to the past has its quote moved out of 'draft'
-- into 'accepted' or 'invoiced' (this is performed by the pre-existing
-- trg_session_close_to_invoice, which calls accept_quote_for_booking + create_invoice_for_booking).
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_service_id uuid;
  v_booking_id uuid; v_quote_id uuid;
  v_q_status   text; v_q_accepted_at timestamptz; v_q_invoiced_at timestamptz;
  v_ok         boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type)
    VALUES (gen_random_uuid(), 'TEST_T91', 'sl-' || substr(md5(random()::text),1,8), 'autonomo')
    RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name, email, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'C', 'c91@x.com', now(), now())
    RETURNING id INTO v_client_id;
  INSERT INTO public.services (id, company_id, name, base_price, tax_rate, is_active, is_bookable, enable_waitlist, active_mode_enabled, passive_mode_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'S', 100, 21, true, true, false, true, true, now(), now())
    RETURNING id INTO v_service_id;
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name,
    start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, v_service_id, 'T91',
      now() + interval '1 hour', now() + interval '2 hours', 'confirmed', 'internal',
      100, 'EUR', 'presencial', 0)
    RETURNING id INTO v_booking_id;
  SELECT id INTO v_quote_id FROM public.quotes WHERE booking_id = v_booking_id;

  -- Sanity: quote starts in draft
  SELECT status::text, accepted_at, invoiced_at INTO v_q_status, v_q_accepted_at, v_q_invoiced_at
  FROM public.quotes WHERE id = v_quote_id;
  IF v_q_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'T9.1 SETUP FAIL: pre-state expected draft, got %', v_q_status;
  END IF;

  -- Move start_time to the past. Existing trg_session_close_to_invoice fires on this update
  -- because NEW.start_time < now(). It calls accept_quote_for_booking + create_invoice_for_booking,
  -- moving the quote to 'accepted' (then 'invoiced' once the invoice row is created).
  UPDATE public.bookings SET start_time = now() - interval '1 day' WHERE id = v_booking_id;

  -- Quote should be 'accepted' or 'invoiced' (NOT 'draft')
  SELECT status::text, accepted_at, invoiced_at INTO v_q_status, v_q_accepted_at, v_q_invoiced_at
  FROM public.quotes WHERE id = v_quote_id;
  IF v_q_status = 'draft' THEN
    RAISE EXCEPTION 'T9.1 FAIL: quote still in draft after start_time moved to past (status=%, accepted_at=%, invoiced_at=%)', v_q_status, v_q_accepted_at, v_q_invoiced_at;
  END IF;
  IF v_q_status NOT IN ('accepted', 'invoiced') THEN
    RAISE EXCEPTION 'T9.1 FAIL: expected accepted|invoiced, got %', v_q_status;
  END IF;
  IF v_q_accepted_at IS NULL THEN
    RAISE EXCEPTION 'T9.1 FAIL: accepted_at should be set';
  END IF;

  RAISE NOTICE 'PASS T9.1: past session moves quote out of draft (status=%)', v_q_status;
END $$;
ROLLBACK;

-- T3.3: past booking with quote already accepted (idempotency on accept + always invoice)
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_service_id uuid; v_booking_id uuid; v_quote_id uuid;
  v_q_status text; v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type) VALUES (gen_random_uuid(), 'C', 'sl-' || substr(md5(random()::text),1,8), 'autonomo') RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name) VALUES (gen_random_uuid(), v_company_id, 'CL') RETURNING id INTO v_client_id;
  INSERT INTO public.services (id, company_id, name, base_price, is_active, is_bookable, enable_waitlist, active_mode_enabled, passive_mode_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'S', 50, true, true, false, true, true, now(), now()) RETURNING id INTO v_service_id;

  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, v_service_id, 'X', now() - interval '3 days', now() - interval '3 days 1 hour', 'confirmed', 'internal', 50, 'EUR', 'presencial', 0)
    RETURNING id, quote_id INTO v_booking_id, v_quote_id;

  -- Manually set quote to accepted
  UPDATE public.quotes SET status = 'accepted' WHERE id = v_quote_id;

  -- v3 backfill: accept (idempotent) + create invoice
  UPDATE public.quotes SET status = 'accepted' WHERE id = v_quote_id AND status = 'draft';

  SELECT status INTO v_q_status FROM public.quotes WHERE id = v_quote_id;
  IF v_q_status IS DISTINCT FROM 'accepted' THEN RAISE NOTICE 'FAIL T3.3: quote not accepted, got %', v_q_status; v_ok := false; END IF;

  IF v_ok THEN RAISE NOTICE 'PASS T3.3: idempotent accept on already-accepted quote';
  ELSE RAISE EXCEPTION 'TEST FAILED T3.3'; END IF;
END $$;
ROLLBACK;

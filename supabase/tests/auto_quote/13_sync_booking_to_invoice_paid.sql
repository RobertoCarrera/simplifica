-- T4.1: bookings.payment_status change propagates to invoice
BEGIN;
DO $$
DECLARE
  v_company_id uuid; v_client_id uuid; v_service_id uuid;
  v_booking_id uuid; v_invoice_id uuid;
  v_i_pstatus text; v_ok boolean := true;
BEGIN
  INSERT INTO public.companies (id, name, slug, company_type) VALUES (gen_random_uuid(), 'C', 'sl-' || substr(md5(random()::text),1,8), 'autonomo') RETURNING id INTO v_company_id;
  INSERT INTO public.clients (id, company_id, name) VALUES (gen_random_uuid(), v_company_id, 'CL') RETURNING id INTO v_client_id;
  INSERT INTO public.services (id, company_id, name, is_active, is_bookable, enable_waitlist, active_mode_enabled, passive_mode_enabled, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, 'S', true, true, false, true, true, now(), now()) RETURNING id INTO v_service_id;

  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, start_time, end_time, status, source, total_price, currency, session_type, form_responses_key_version)
    VALUES (gen_random_uuid(), v_company_id, v_client_id, v_service_id, 'X', now() - interval '1d', now() - interval '1d 1h', 'confirmed', 'internal', 50, 'EUR', 'presencial', 0)
    RETURNING id INTO v_booking_id;

  -- Backfill: also create invoice manually for this test
  DECLARE v_series_id uuid; BEGIN
    INSERT INTO public.invoice_series (id, company_id, series_code, series_name, year, prefix, next_number, is_active, is_default, verifactu_enabled, created_at, updated_at)
      VALUES (gen_random_uuid(), v_company_id, 'A', 'A', 2026, 'A-', 1, true, true, false, now(), now())
      RETURNING id INTO v_series_id;
    INSERT INTO public.invoices (company_id, client_id, series_id, invoice_number, invoice_series, invoice_type, invoice_date, due_date, subtotal, tax_amount, total, currency, status, payment_status, gdpr_legal_basis, canonical_payload)
      VALUES (v_company_id, v_client_id, v_series_id, '1', 'A', 'simplified', CURRENT_DATE, CURRENT_DATE+30, 50, 10.5, 60.5, 'EUR', 'draft', 'pending', 'contract', '{}'::jsonb)
      RETURNING id INTO v_invoice_id;
    UPDATE public.bookings SET invoice_id = v_invoice_id WHERE id = v_booking_id;
  END;

  -- The v3 trigger fires on INSERT and creates another invoice. We need to ensure
  -- we are updating the one we created. Use the explicit invoice_id.
  -- Mark booking as paid
  UPDATE public.bookings SET payment_status = 'paid' WHERE id = v_booking_id;

  SELECT payment_status INTO v_i_pstatus FROM public.invoices WHERE id = v_invoice_id;
  IF v_i_pstatus IS DISTINCT FROM 'paid' THEN
    RAISE NOTICE 'FAIL T4.1: invoice payment_status expected paid, got %', v_i_pstatus;
    v_ok := false;
  END IF;
  IF v_ok THEN RAISE NOTICE 'PASS T4.1: booking->invoice sync';
  ELSE RAISE EXCEPTION 'TEST FAILED T4.1'; END IF;
END $$;
ROLLBACK;

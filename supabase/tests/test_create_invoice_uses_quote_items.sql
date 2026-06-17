-- Test 05: create_invoice_for_booking reads from quote_items, not bookings.total_price
-- Verifies the fix in migration 20260617000009: a booking with total_price=0
-- but quote_items with values should still produce an invoice with the
-- correct total.

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_company_05() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000050';
  INSERT INTO public.companies (id, slug, name, settings)
  VALUES (v_id, 'test-cifb-05', 'Test CIFB 05', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_client_05() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000051';
  INSERT INTO public.clients (id, company_id, name, email, client_type)
  VALUES (v_id, public.seed_company_05(), 'Test Client CIFB 05', 'test-cifb-05@example.com', 'individual')
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_booking_with_quote_05() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := 'a1a1a1a1-0000-0000-0000-000000000052';
  v_svc uuid;
BEGIN
  SELECT id INTO v_svc FROM public.services WHERE is_active = true LIMIT 1;
  IF v_svc IS NULL THEN RAISE EXCEPTION 'No active service'; END IF;
  -- Insert booking with service, client, and a 0.00 total_price (simulating the bug)
  INSERT INTO public.bookings (id, company_id, client_id, service_id, customer_name, customer_email,
    start_time, end_time, status, source, total_price, currency)
  VALUES (v_id, public.seed_company_05(), public.seed_client_05(), v_svc, 'Test Customer CIFB 05', 'cust-cifb-05@example.com',
    now() + interval '30 days', now() + interval '30 days 1 hour', 'confirmed', 'manual', 0.00, 'EUR')
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

DO $$
DECLARE v_company_id uuid := public.seed_company_05();
DECLARE v_client_id uuid := public.seed_client_05();
DECLARE v_booking_id uuid := public.seed_booking_with_quote_05();
DECLARE v_new_invoice_id uuid;
DECLARE v_new_total numeric;
DECLARE v_expected_total numeric;
DECLARE v_quote_id uuid;
BEGIN
  RAISE NOTICE 'Test 05: setup done (booking with total_price=0)';

  -- Force session_close to fire create_invoice_for_booking
  UPDATE public.bookings
  SET session_confirmed_at = now(), updated_at = now()
  WHERE id = v_booking_id;
  RAISE NOTICE 'Test 5.1: session_confirmed_at set';

  SELECT invoice_id INTO v_new_invoice_id FROM public.bookings WHERE id = v_booking_id;
  IF v_new_invoice_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 5.2: no invoice created (function returned NULL?)';
  END IF;
  RAISE NOTICE 'Test 5.2: invoice created (%)', v_new_invoice_id;

  SELECT total INTO v_new_total FROM public.invoices WHERE id = v_new_invoice_id;
  SELECT q.id, ROUND(SUM(qi.quantity * qi.unit_price * (1 + COALESCE(qi.tax_rate, 0)/100)), 2)
    INTO v_quote_id, v_expected_total
  FROM public.quotes q
  JOIN public.quote_items qi ON qi.quote_id = q.id
  WHERE q.booking_id = v_booking_id
  GROUP BY q.id;

  RAISE NOTICE 'Invoice total: % (expected: %)', v_new_total, v_expected_total;

  IF v_new_total IS DISTINCT FROM v_expected_total THEN
    RAISE EXCEPTION 'FAIL 5.3: invoice total (%) does not match quote_items total (%)',
      v_new_total, v_expected_total;
  END IF;
  RAISE NOTICE 'Test 5.3 PASS: invoice total matches quote_items total (not bookings.total_price)';

  -- Verify invoice_items were created (one per quote_item)
  PERFORM 1 FROM public.invoice_items WHERE invoice_id = v_new_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL 5.4: no invoice_items created'; END IF;
  RAISE NOTICE 'Test 5.4 PASS: invoice_items exist';

  RAISE NOTICE '=== Test 05 PASSED ===';
END $$;

ROLLBACK;
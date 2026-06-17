-- Test 02: Retroactive quote trigger fires on service_id NULL → NOT NULL
-- Verifies REQ-1.B

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_company_02() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000020';
  INSERT INTO public.companies (id, slug, name, settings)
  VALUES (v_id, 'test-rqa-02', 'Test RQA 02', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_client_02() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := 'a1a1a1a1-0000-0000-0000-000000000021';
  INSERT INTO public.clients (id, company_id, name, email, client_type)
  VALUES (v_id, public.seed_company_02(), 'Test Client RQA 02', 'test-rqa-02@example.com', 'individual')
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_orphan_booking_02() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := 'a1a1a1a1-0000-0000-0000-000000000022';
BEGIN
  INSERT INTO public.bookings (id, company_id, client_id, customer_name, customer_email,
    start_time, end_time, status, source, total_price, currency)
  VALUES (v_id, public.seed_company_02(), public.seed_client_02(), 'Test Customer RQA 02', 'cust-rqa-02@example.com',
    now() + interval '30 days', now() + interval '30 days 1 hour', 'confirmed', 'manual', 150.00, 'EUR')
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END;
$$;

DO $$
DECLARE v_company_id uuid := public.seed_company_02();
DECLARE v_client_id uuid := public.seed_client_02();
DECLARE v_booking_id uuid := public.seed_orphan_booking_02();
DECLARE v_svc uuid;
DECLARE v_quote_id_actual uuid;
DECLARE v_status text;
BEGIN
  RAISE NOTICE 'Test 02: setup done';
  SELECT id INTO v_svc FROM public.services WHERE is_active = true LIMIT 1;
  IF v_svc IS NULL THEN RAISE EXCEPTION 'No active service'; END IF;

  -- Pre-condition: no service_id
  IF EXISTS (SELECT 1 FROM public.bookings WHERE id = v_booking_id AND service_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 2.0: service_id should be NULL';
  END IF;
  RAISE NOTICE 'Test 2.0 PASS: service_id is NULL';

  -- Action: set service_id
  UPDATE public.bookings SET service_id = v_svc, updated_at = now() WHERE id = v_booking_id;
  RAISE NOTICE 'Test 2.1: service_id set';

  -- Post-condition
  SELECT quote_id INTO v_quote_id_actual FROM public.bookings WHERE id = v_booking_id;
  IF v_quote_id_actual IS NULL THEN RAISE EXCEPTION 'FAIL 2.2: quote_id should be set'; END IF;
  RAISE NOTICE 'Test 2.2 PASS';

  SELECT status::text INTO v_status FROM public.quotes WHERE id = v_quote_id_actual;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'FAIL 2.3: status should be draft'; END IF;
  RAISE NOTICE 'Test 2.3 PASS';

  -- Verify quote has at least one item
  PERFORM 1 FROM public.quote_items WHERE quote_id = v_quote_id_actual;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL 2.4: no quote_items created'; END IF;
  RAISE NOTICE 'Test 2.4 PASS';

  RAISE NOTICE '=== Test 02 PASSED ===';
END $$;

ROLLBACK;
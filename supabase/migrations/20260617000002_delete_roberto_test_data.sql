-- ============================================================================
-- Delete Roberto Carrera Santa Maria + prueba roberto test data
-- Scope: bookings, quotes, quote_items, invoices, invoice_items (and FK unlinks)
-- Clients: 7b0cf4ac (Roberto Carrera Santa Maria) and 724b89ce (prueba roberto)
-- 'cliente roberto' (57c3f125) was out of scope — preserved.
-- Pre-condition: no invoices linked to these clients have verifactu data
-- (enforced at runtime; raises if violated).
-- Idempotent: re-running on already-clean data is a no-op.
-- User confirmation: these are personal test rows, not real customer data.
-- ============================================================================

DO $$
DECLARE
  v_client_ids uuid[] := ARRAY[
    '7b0cf4ac-6632-4b7e-ac3e-dea6184307ab',  -- Roberto Carrera Santa Maria
    '724b89ce-b1b5-48f3-9154-2135a52b3559'   -- prueba roberto
  ];
  v_quote_ids uuid[];
  v_invoice_ids uuid[];
  v_booking_ids uuid[];
  v_n_quote_items int := 0;
  v_n_quotes int := 0;
  v_n_invoice_items int := 0;
  v_n_invoices int := 0;
  v_n_bookings int := 0;
  v_n_clients int := 0;
  v_n_unlink_quote int := 0;
  v_n_unlink_invoice int := 0;
BEGIN
  -- Pre-check: refuse if any linked invoice has verifactu data
  PERFORM 1
  FROM public.invoices i
  JOIN public.quotes q ON q.id = i.source_quote_id
  WHERE q.client_id = ANY(v_client_ids)
    AND (i.verifactu_hash IS NOT NULL OR i.canonical_payload != '{}'::jsonb);

  IF FOUND THEN
    RAISE EXCEPTION 'ABORT: invoices with verifactu data found for Roberto clients. Cannot delete safely.';
  END IF;

  -- Collect IDs
  SELECT array_agg(id) INTO v_quote_ids
  FROM public.quotes WHERE client_id = ANY(v_client_ids);

  SELECT array_agg(id) INTO v_invoice_ids
  FROM public.invoices WHERE source_quote_id = ANY(v_quote_ids);

  SELECT array_agg(id) INTO v_booking_ids
  FROM public.bookings WHERE client_id = ANY(v_client_ids);

  RAISE NOTICE 'Scope: % quotes, % invoices, % bookings',
    COALESCE(array_length(v_quote_ids, 1), 0),
    COALESCE(array_length(v_invoice_ids, 1), 0),
    COALESCE(array_length(v_booking_ids, 1), 0);

  -- 0. Unlink bookings.quote_id / invoice_id FIRST (avoid FK violations on DELETE quotes/invoices)
  UPDATE public.bookings SET quote_id = NULL, updated_at = now()
  WHERE quote_id = ANY(v_quote_ids);
  GET DIAGNOSTICS v_n_unlink_quote = ROW_COUNT;

  UPDATE public.bookings SET invoice_id = NULL, updated_at = now()
  WHERE invoice_id = ANY(v_invoice_ids);
  GET DIAGNOSTICS v_n_unlink_invoice = ROW_COUNT;

  RAISE NOTICE 'Unlinked bookings: quote_id=% invoice_id=%', v_n_unlink_quote, v_n_unlink_invoice;

  -- 1. invoice_items (leaf of invoice tree)
  DELETE FROM public.invoice_items WHERE invoice_id = ANY(v_invoice_ids);
  GET DIAGNOSTICS v_n_invoice_items = ROW_COUNT;

  -- 2. invoices
  DELETE FROM public.invoices WHERE id = ANY(v_invoice_ids);
  GET DIAGNOSTICS v_n_invoices = ROW_COUNT;

  -- 3. quote_items (leaf of quote tree)
  DELETE FROM public.quote_items WHERE quote_id = ANY(v_quote_ids);
  GET DIAGNOSTICS v_n_quote_items = ROW_COUNT;

  -- 4. quotes
  DELETE FROM public.quotes WHERE id = ANY(v_quote_ids);
  GET DIAGNOSTICS v_n_quotes = ROW_COUNT;

  -- 5. bookings
  DELETE FROM public.bookings WHERE id = ANY(v_booking_ids);
  GET DIAGNOSTICS v_n_bookings = ROW_COUNT;

  -- 6. clients
  DELETE FROM public.clients WHERE id = ANY(v_client_ids);
  GET DIAGNOSTICS v_n_clients = ROW_COUNT;

  -- Post-checks
  PERFORM 1 FROM public.quotes WHERE client_id = ANY(v_client_ids);
  IF FOUND THEN RAISE EXCEPTION 'Post-check failed: quotes remain'; END IF;

  PERFORM 1 FROM public.bookings WHERE id = ANY(v_booking_ids);
  IF FOUND THEN RAISE EXCEPTION 'Post-check failed: bookings remain'; END IF;

  PERFORM 1 FROM public.clients WHERE id = ANY(v_client_ids);
  IF FOUND THEN RAISE EXCEPTION 'Post-check failed: clients remain'; END IF;

  RAISE NOTICE '=== CLEANUP SUMMARY ===';
  RAISE NOTICE 'Clients deleted:       %', v_n_clients;
  RAISE NOTICE 'Bookings deleted:      %', v_n_bookings;
  RAISE NOTICE 'Quotes deleted:        %', v_n_quotes;
  RAISE NOTICE 'Quote_items deleted:   %', v_n_quote_items;
  RAISE NOTICE 'Invoices deleted:      %', v_n_invoices;
  RAISE NOTICE 'Invoice_items deleted: %', v_n_invoice_items;
  RAISE NOTICE 'Bookings unlinked FK:  %', v_n_unlink_quote + v_n_unlink_invoice;
  RAISE NOTICE 'TOTAL rows deleted:    %',
    v_n_clients + v_n_bookings + v_n_quotes + v_n_quote_items + v_n_invoices + v_n_invoice_items;
END $$;
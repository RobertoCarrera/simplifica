-- ============================================================================
-- Fix create_invoice_for_booking: prefer quote_items values over
-- bookings.total_price / services.base_price.
--
-- Why: The original function read bookings.total_price and services.tax_rate
-- to compute the invoice line. But when quote_items is present (every
-- booking-driven quote has them), the quote_items reflect the actual
-- agreed price. Using bookings.total_price caused the invoice to be
-- created with the WRONG price whenever total_price was stale or 0.
-- Manifested today when 3 invoices were created with totals that didn't
-- match quote_items (333=0, 364=72.60, 366=72.60).
--
-- New logic:
-- 1. If the booking has quote_items, sum from those (preferred).
-- 2. Otherwise, fallback to bookings.total_price / services (legacy path).
--
-- This migration:
-- - Replaces the function with the corrected version
-- - Backfills 25 draft invoices whose invoice_items were stale relative to
--   the current quote_items (mostly from this morning's psicoterapia
--   migration 20260617000006)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_invoice_for_booking(p_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id          uuid;
  v_company_id          uuid;
  v_client_id           uuid;
  v_service_id          uuid;
  v_currency            text;
  v_quote_id            uuid;
  v_payment_method      text;

  -- Computed from quote_items (preferred) or fallback to bookings/services
  v_line_subtotal       numeric;
  v_line_tax            numeric;
  v_subtotal            numeric;
  v_tax_amount          numeric;
  v_total               numeric;
  v_line_description    text;

  v_series_id           uuid;
  v_next_number         int;
  v_invoice_number      text;
  v_quote_items_count   int;
  v_total_price         numeric;
  v_service_tax_rate    numeric;
  v_service_name        text;
BEGIN
  -- 1. Load booking essentials
  SELECT b.company_id, b.client_id, b.service_id, COALESCE(b.currency, 'EUR'),
         b.quote_id, b.payment_method::text
    INTO v_company_id, v_client_id, v_service_id, v_currency,
         v_quote_id, v_payment_method
  FROM public.bookings b
  WHERE b.id = p_booking_id;

  IF v_company_id IS NULL THEN RETURN NULL; END IF;

  -- Idempotency: if invoice already exists, return it
  IF EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id AND invoice_id IS NOT NULL) THEN
    RETURN (SELECT invoice_id FROM public.bookings WHERE id = p_booking_id);
  END IF;

  IF v_client_id IS NULL THEN RETURN NULL; END IF;

  -- 2. Compute subtotal, tax, total from quote_items if available
  -- (handles N-services bookings: SUM across all items)
  SELECT
    count(*),
    COALESCE(SUM(quantity * COALESCE(unit_price, 0)), 0),
    COALESCE(SUM(quantity * COALESCE(unit_price, 0) * COALESCE(tax_rate, 0) / 100.0), 0)
  INTO v_quote_items_count, v_line_subtotal, v_line_tax
  FROM public.quote_items
  WHERE quote_id = v_quote_id;

  -- Fallback path: no quote_items. Use bookings.total_price + services.
  IF v_quote_items_count = 0 THEN
    SELECT COALESCE(b.total_price, 0)
      INTO v_total_price
    FROM public.bookings b
    WHERE b.id = p_booking_id;

    v_service_tax_rate := 21;
    v_service_name := 'Servicio prestado';
    IF v_service_id IS NOT NULL THEN
      SELECT s.tax_rate, s.name
        INTO v_service_tax_rate, v_service_name
      FROM public.services s WHERE s.id = v_service_id;
    END IF;

    v_line_subtotal := ROUND(v_total_price, 2);
    v_line_tax := ROUND(v_line_subtotal * v_service_tax_rate / 100.0, 2);
    v_line_description := v_service_name;
  ELSE
    SELECT description INTO v_line_description
    FROM public.quote_items
    WHERE quote_id = v_quote_id
    ORDER BY line_number ASC
    LIMIT 1;
  END IF;

  v_subtotal := v_line_subtotal;
  v_tax_amount := v_line_tax;
  v_total := ROUND(v_line_subtotal + v_line_tax, 2);

  -- 3. Get next invoice number
  v_series_id := public.ensure_default_invoice_series(v_company_id);

  SELECT COALESCE(MAX(CAST(invoice_number AS int)), 0) + 1
    INTO v_next_number
  FROM public.invoices
  WHERE company_id = v_company_id AND invoice_series = 'A';
  v_invoice_number := v_next_number::text;

  -- 4. Insert invoice
  IF v_payment_method IS NOT NULL THEN
    INSERT INTO public.invoices (
      company_id, client_id, series_id, invoice_number, invoice_series,
      invoice_type, invoice_date, due_date,
      subtotal, tax_amount, total, currency,
      status, payment_status, payment_method, gdpr_legal_basis,
      source_quote_id, canonical_payload
    ) VALUES (
      v_company_id, v_client_id, v_series_id, v_invoice_number, 'A',
      'simplified', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
      v_subtotal, v_tax_amount, v_total, v_currency,
      'draft', 'pending', v_payment_method::public.payment_method, 'contract',
      v_quote_id, '{}'::jsonb
    )
    RETURNING id INTO v_invoice_id;
  ELSE
    INSERT INTO public.invoices (
      company_id, client_id, series_id, invoice_number, invoice_series,
      invoice_type, invoice_date, due_date,
      subtotal, tax_amount, total, currency,
      status, payment_status, gdpr_legal_basis,
      source_quote_id, canonical_payload
    ) VALUES (
      v_company_id, v_client_id, v_series_id, v_invoice_number, 'A',
      'simplified', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
      v_subtotal, v_tax_amount, v_total, v_currency,
      'draft', 'pending', 'contract',
      v_quote_id, '{}'::jsonb
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  -- 5. Insert invoice_items: one per quote_item (or one fallback line)
  IF v_quote_items_count > 0 THEN
    INSERT INTO public.invoice_items (
      invoice_id, line_order, description, quantity, unit_price,
      discount_percent, tax_rate, tax_amount, subtotal, total, service_id
    )
    SELECT
      v_invoice_id,
      qi.line_number,
      qi.description,
      qi.quantity,
      qi.unit_price,
      COALESCE(qi.discount_percent, 0),
      qi.tax_rate,
      qi.tax_amount,
      qi.subtotal,
      qi.total,
      qi.service_id
    FROM public.quote_items qi
    WHERE qi.quote_id = v_quote_id
    ORDER BY qi.line_number ASC;
  ELSE
    INSERT INTO public.invoice_items (
      invoice_id, line_order, description, quantity, unit_price,
      discount_percent, tax_rate, tax_amount, subtotal, total, service_id
    ) VALUES (
      v_invoice_id, 1, v_line_description, 1, v_line_subtotal,
      0, 21, v_line_tax, v_line_subtotal, v_total, v_service_id
    );
  END IF;

  -- 6. Link booking to invoice
  UPDATE public.bookings SET invoice_id = v_invoice_id WHERE id = p_booking_id;
  UPDATE public.invoices SET source_quote_id = v_quote_id WHERE id = v_invoice_id AND v_quote_id IS NOT NULL;

  RETURN v_invoice_id;
END;
$function$;

-- ============================================================================
-- Backfill 25 draft invoices whose invoice_items were stale.
-- Delete stale invoice_items and recreate from current quote_items values,
-- then recalculate invoice totals (subtotal/tax_amount/total/total_tax_base/
-- total_vat/total_gross).
-- ============================================================================

DO $$
DECLARE
  v_n_inv_items int := 0;
  v_n_invoices int := 0;
BEGIN
  -- 1. Delete stale invoice_items for draft invoices whose quote_items have changed
  DELETE FROM public.invoice_items ii
  USING public.invoices i, public.quotes q, public.quote_items qi
  WHERE ii.invoice_id = i.id
    AND i.source_quote_id = q.id
    AND qi.quote_id = q.id
    AND i.status = 'draft'
    AND (ii.unit_price != qi.unit_price
         OR ii.tax_rate != qi.tax_rate
         OR ii.description != qi.description
         OR i.total != q.total_amount);

  -- 2. Insert fresh invoice_items from quote_items
  INSERT INTO public.invoice_items (
    invoice_id, line_order, description, quantity, unit_price,
    discount_percent, tax_rate, tax_amount, subtotal, total, service_id
  )
  SELECT
    i.id,
    qi.line_number,
    qi.description,
    qi.quantity,
    qi.unit_price,
    COALESCE(qi.discount_percent, 0),
    qi.tax_rate,
    qi.tax_amount,
    qi.subtotal,
    qi.total,
    qi.service_id
  FROM public.invoices i
  JOIN public.quotes q ON q.id = i.source_quote_id
  JOIN public.quote_items qi ON qi.quote_id = q.id
  WHERE i.status = 'draft';
  GET DIAGNOSTICS v_n_inv_items = ROW_COUNT;

  -- 3. Recalculate invoice totals from invoice_items
  UPDATE public.invoices inv
  SET subtotal = (SELECT COALESCE(SUM(subtotal), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      tax_amount = (SELECT COALESCE(SUM(tax_amount), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total = (SELECT COALESCE(SUM(total), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total_tax_base = (SELECT COALESCE(SUM(subtotal), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total_vat = (SELECT COALESCE(SUM(tax_amount), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total_gross = (SELECT COALESCE(SUM(total), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      updated_at = now()
  WHERE inv.status = 'draft';
  GET DIAGNOSTICS v_n_invoices = ROW_COUNT;

  RAISE NOTICE 'Backfilled % invoice_items across % draft invoices', v_n_inv_items, v_n_invoices;
END $$;
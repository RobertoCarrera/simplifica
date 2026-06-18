-- ============================================================================
-- Hotfix: create_invoice_for_booking() aborts silently when bookings.client_id
-- is NULL. The function returns NULL without creating the invoice, leaving
-- accepted quotes forever stuck without their invoice.
--
-- Why client_id can be NULL on a booking that has a quote:
--   1. docplanner-sync-cron rewrites bookings every 15 min; if the sync
--      can't find the patient (no docplanner_patient_id, no email, no phone
--      match), it creates a new client and may or may not reattach it.
--   2. The duplicate-merge RPC moves bookings between clients during a
--      merge; transient NULL windows are possible.
--   3. Manual data fixes or imports may have left client_id NULL.
--
-- In all cases the linked quote still has the correct client_id, so the
-- fix is a COALESCE: prefer the booking's client_id, fall back to the
-- quote's client_id. Only return NULL if NEITHER has a value.
--
-- Also: this same function was the reason 4 quotes (2026-P-00161, -164,
-- -165, -167) were stuck in 'accepted' status without an invoice after the
-- 2026-06-17 20:58 Phase-2 cron confirmed their sessions — the trigger
-- fired, the function ran, but bookings.client_id was NULL and the function
-- returned NULL silently. Manually invoiced on 2026-06-18; root cause fixed
-- here.
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

  v_service_tax_rate    numeric;
  v_service_name        text;
BEGIN
  -- 1. Load booking essentials.
  -- HOTFIX 2026-06-18: client_id is now COALESCE(b.client_id, q.client_id).
  -- The linked quote always has the correct client even if the booking's
  -- client_id was wiped by the Docplanner sync or a duplicate merge.
  SELECT b.company_id,
         COALESCE(b.client_id, q.client_id) AS client_id,
         b.service_id,
         COALESCE(b.currency, 'EUR'),
         b.quote_id,
         b.payment_method::text
    INTO v_company_id, v_client_id, v_service_id, v_currency,
         v_quote_id, v_payment_method
  FROM public.bookings b
  LEFT JOIN public.quotes q ON q.id = b.quote_id
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
    DECLARE
      v_total_price numeric;
      v_service_tax_rate numeric := 21;
      v_service_name text := 'Servicio prestado';
    BEGIN
      SELECT COALESCE(b.total_price, 0)
        INTO v_total_price
      FROM public.bookings b
      WHERE b.id = p_booking_id;

      IF v_service_id IS NOT NULL THEN
        SELECT s.tax_rate, s.name
          INTO v_service_tax_rate, v_service_name
        FROM public.services s WHERE s.id = v_service_id;
      END IF;

      v_line_subtotal := ROUND(v_total_price, 2);
      v_line_tax := ROUND(v_line_subtotal * v_service_tax_rate / 100.0, 2);
      v_line_description := v_service_name;
    END;
  ELSE
    -- Use the first quote_item's description (most common case: 1 service)
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

COMMENT ON FUNCTION public.create_invoice_for_booking(uuid) IS
  'Creates a draft invoice for a booking using its quote_items (or fallback to bookings.total_price). Hotfix 2026-06-18: client_id falls back to quotes.client_id when bookings.client_id is NULL, so invoices can be generated even when the booking lost its client link.';

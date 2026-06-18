-- ============================================================================
-- Migration: csv_doctoralia_booking_trigger_guard
--
-- Prevents the trg_auto_quote_on_booking trigger from creating a draft
-- public.quotes row for bookings imported from the Doctoralia CSV wizard.
--
-- Why: Doctoralia CSV imports are silent data imports. The user explicitly
--      does NOT want any paperwork (quote/invoice) to be created as a
--      side effect of importing historical reservations.
--
-- IMPORTANT: this trigger runs AFTER INSERT (not BEFORE) because the live
--            trigger is defined as AFTER INSERT and uses
--            `UPDATE public.bookings SET quote_id = v_quote_id WHERE id = NEW.id`
--            instead of `NEW.quote_id := v_quote_id` (the BEFORE INSERT variant
--            would violate the quotes_booking_id_fkey FK because NEW.id is
--            not yet visible to the FK constraint inside a BEFORE INSERT
--            trigger). The migration is kept in sync with the live DB.
--
-- Pre-conditions (already in the DB, not created here):
--   * public.bookings.source text NOT NULL (no CHECK constraint)
--   * public.trg_auto_quote_on_booking trigger
--   * public.trg_auto_create_quote_on_booking function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_auto_create_quote_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote_id            uuid;
  v_service_id          uuid := NEW.service_id;
  v_service_name        text;
  v_service_tax_rate    numeric;
  v_unit_price          numeric;
  v_currency            text;
  v_year                int  := EXTRACT(year FROM CURRENT_DATE)::int;
  v_sequence_number     int;
  v_quote_number        text;
  v_line_subtotal       numeric;
  v_line_tax            numeric;
  v_line_total          numeric;
  v_subtotal            numeric;
  v_tax_amount          numeric;
  v_total               numeric;
BEGIN
  -- 0. Guard: silent imports from the Doctoralia CSV wizard must NOT
  --    trigger auto-quote creation. The wizard stamps source =
  --    'csv-doctoralia' on every imported row. The guard short-circuits
  --    the trigger before any paperwork side-effects can run.
  IF NEW.source = 'csv-doctoralia' THEN
    RETURN NEW;
  END IF;

  -- 1. Idempotency: never create more than one quote per booking.
  IF NEW.quote_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Cannot create a quote without a client. Skip silently.
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Resolve service info (best-effort; missing service is not fatal).
  IF v_service_id IS NOT NULL THEN
    SELECT s.name, s.base_price, s.tax_rate
      INTO v_service_name, v_unit_price, v_service_tax_rate
    FROM public.services s
    WHERE s.id = v_service_id;
  END IF;

  v_service_name     := COALESCE(v_service_name, 'Servicio reservado');
  v_unit_price       := COALESCE(NEW.total_price, v_unit_price, 0);
  v_service_tax_rate := COALESCE(v_service_tax_rate, 21);
  v_currency         := COALESCE(NEW.currency, 'EUR');

  -- 4. Compute totals (quantity = 1, no discount).
  v_line_subtotal := ROUND(v_unit_price, 2);
  v_line_tax      := ROUND(v_line_subtotal * v_service_tax_rate / 100.0, 2);
  v_line_total    := ROUND(v_line_subtotal + v_line_tax, 2);

  v_subtotal   := v_line_subtotal;
  v_tax_amount := v_line_tax;
  v_total      := v_line_total;

  -- 5. Sequence number for (company, year). Best-effort MAX+1.
  SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO v_sequence_number
  FROM public.quotes
  WHERE company_id = NEW.company_id AND year = v_year;

  v_quote_number := v_sequence_number::text;

  -- 6. Insert the quote header.
  INSERT INTO public.quotes (
    company_id, client_id,
    quote_number, year, sequence_number,
    status, quote_date, valid_until,
    title, currency, language,
    subtotal, tax_amount, total_amount,
    booking_id
  ) VALUES (
    NEW.company_id, NEW.client_id,
    v_quote_number, v_year, v_sequence_number,
    'draft', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    'Presupuesto - ' || COALESCE(NULLIF(NEW.customer_name, ''), 'Cliente'),
    v_currency, 'es',
    v_subtotal, v_tax_amount, v_total,
    NEW.id
  )
  RETURNING id INTO v_quote_id;

  -- 7. Insert the single line item.
  INSERT INTO public.quote_items (
    quote_id, company_id, line_number,
    description, quantity, unit_price, tax_rate, tax_amount,
    subtotal, total, service_id
  ) VALUES (
    v_quote_id, NEW.company_id, 1,
    v_service_name, 1, v_unit_price, v_service_tax_rate, v_line_tax,
    v_line_subtotal, v_line_total, v_service_id
  );

  -- 8. Stamp the booking. (Safe in AFTER INSERT — the row is already visible.)
  UPDATE public.bookings SET quote_id = v_quote_id WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_auto_create_quote_on_booking() IS
  'AFTER INSERT trigger on public.bookings: creates a draft public.quotes row + 1 public.quote_items row and stamps bookings.quote_id via UPDATE. Idempotent (skips when NEW.quote_id IS NOT NULL). Skips silently when client_id IS NULL. Short-circuits entirely when NEW.source = ''csv-doctoralia'' (silent CSV imports from the Doctoralia wizard).';

-- Re-bind the trigger to the updated function body.
DROP TRIGGER IF EXISTS trg_auto_quote_on_booking ON public.bookings;
CREATE TRIGGER trg_auto_quote_on_booking
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_create_quote_on_booking();

NOTIFY pgrst, 'reload schema';

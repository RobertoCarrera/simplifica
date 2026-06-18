-- Migration: auto_quote_on_booking_lifecycle
-- Scope v2: quote + reconciliation ONLY. No invoice.
-- Generates a draft public.quotes row + 1 public.quote_items row for every
-- newly inserted public.bookings row that has a client_id and does not
-- already have a quote_id. Adds reconciliation views and a backfill for
-- existing bookings.
--
-- Pre-conditions (already in the DB, not created here):
--   * public.bookings.quote_id (FK -> public.quotes.id)
--   * public.quotes.booking_id (FK -> public.bookings.id)
--   * public.quote_items child table
--   * public.services.tax_rate / base_price

-- ════════════════════════════════════════════════════════════════════════
-- 1. Quote auto-creation function
-- ════════════════════════════════════════════════════════════════════════
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
  v_full_quote_number   text;
  v_line_subtotal       numeric;
  v_line_tax            numeric;
  v_line_total          numeric;
  v_subtotal            numeric;
  v_tax_amount          numeric;
  v_total               numeric;
BEGIN
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
  -- Note: `full_quote_number` is a GENERATED column (year || '-P-' || LPAD(seq,5,'0')),
  -- so we do NOT insert it. The DB computes it from year + sequence_number.

  -- 6. Insert the quote header.
  -- Note: public.bookings does NOT have a `created_by` column (only `created_at`).
  -- `quotes.created_by` is nullable, so we leave it NULL. A follow-up could
  -- wire it to `auth.uid()` if the bookings INSERT path supports it.
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

  -- 8. Stamp the booking.
  NEW.quote_id := v_quote_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_auto_create_quote_on_booking() IS
  'BEFORE INSERT trigger on public.bookings: creates a draft public.quotes row + 1 public.quote_items row and stamps bookings.quote_id. Idempotent (skips when NEW.quote_id IS NOT NULL). Skips silently when client_id IS NULL (quotes.client_id is NOT NULL).';

-- ════════════════════════════════════════════════════════════════════════
-- 2. Trigger
-- ════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_auto_quote_on_booking ON public.bookings;
CREATE TRIGGER trg_auto_quote_on_booking
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_create_quote_on_booking();

-- ════════════════════════════════════════════════════════════════════════
-- 3. Reconciliation views
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_booking_reconciliation AS
SELECT
  b.id              AS booking_id,
  b.company_id,
  b.client_id,
  b.customer_name,
  b.start_time,
  b.status          AS booking_status,
  b.payment_status  AS booking_payment_status,
  (b.session_confirmed_at IS NOT NULL) AS session_confirmed,
  b.quote_id        IS NOT NULL         AS has_quote,
  q.status          AS quote_status,
  q.total_amount    AS quote_total,
  CASE
    WHEN b.quote_id IS NULL THEN 'missing_quote'
    WHEN q.status = 'draft'  THEN 'quote_draft'
    ELSE 'ok'
  END AS reconciliation_status
FROM public.bookings b
LEFT JOIN public.quotes q ON q.id = b.quote_id;

CREATE OR REPLACE VIEW public.v_reconciliation_summary AS
SELECT
  b.company_id,
  COUNT(*)                                          AS total_bookings,
  COUNT(*) FILTER (WHERE b.quote_id IS NULL)        AS bookings_without_quote,
  COUNT(*) FILTER (WHERE b.quote_id IS NOT NULL)    AS bookings_with_quote,
  COUNT(*) FILTER (WHERE q.status = 'draft')        AS quotes_draft,
  COUNT(*) FILTER (WHERE q.status = 'accepted')     AS quotes_accepted,
  COUNT(*) FILTER (WHERE q.status = 'rejected')     AS quotes_rejected
FROM public.bookings b
LEFT JOIN public.quotes q ON q.id = b.quote_id
GROUP BY b.company_id;

-- ════════════════════════════════════════════════════════════════════════
-- 4. Backfill: existing bookings with quote_id IS NULL AND client_id IS NOT NULL
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r                  record;
  v_quote_id         uuid;
  v_service_id       uuid;
  v_service_name     text;
  v_service_tax_rate numeric;
  v_unit_price       numeric;
  v_currency         text;
  v_year             int;
  v_sequence_number  int;
  v_quote_number     text;
  v_full_quote_number text;
  v_line_subtotal    numeric;
  v_line_tax         numeric;
  v_line_total       numeric;
  v_subtotal         numeric;
  v_tax_amount       numeric;
  v_total            numeric;
BEGIN
  FOR r IN
    SELECT b.id, b.company_id, b.client_id, b.service_id,
           b.customer_name, b.total_price, COALESCE(b.currency, 'EUR') AS currency
    FROM public.bookings b
    WHERE b.quote_id IS NULL
      AND b.client_id IS NOT NULL
  LOOP
    BEGIN
      v_service_id   := r.service_id;
      v_currency     := r.currency;
      v_year         := EXTRACT(year FROM CURRENT_DATE)::int;

      IF v_service_id IS NOT NULL THEN
        SELECT s.name, s.base_price, s.tax_rate
          INTO v_service_name, v_unit_price, v_service_tax_rate
        FROM public.services s WHERE s.id = v_service_id;
      END IF;

      v_service_name     := COALESCE(v_service_name, 'Servicio reservado');
      v_unit_price       := COALESCE(r.total_price, v_unit_price, 0);
      v_service_tax_rate := COALESCE(v_service_tax_rate, 21);

      v_line_subtotal := ROUND(v_unit_price, 2);
      v_line_tax      := ROUND(v_line_subtotal * v_service_tax_rate / 100.0, 2);
      v_line_total    := ROUND(v_line_subtotal + v_line_tax, 2);
      v_subtotal      := v_line_subtotal;
      v_tax_amount    := v_line_tax;
      v_total         := v_line_total;

      SELECT COALESCE(MAX(sequence_number), 0) + 1
        INTO v_sequence_number
      FROM public.quotes
      WHERE company_id = r.company_id AND year = v_year;

      v_quote_number := v_sequence_number::text;
      -- `full_quote_number` is GENERATED — omitted from INSERT.

      INSERT INTO public.quotes (
        company_id, client_id,
        quote_number, year, sequence_number,
        status, quote_date, valid_until,
        title, currency, language,
        subtotal, tax_amount, total_amount, booking_id
      ) VALUES (
        r.company_id, r.client_id,
        v_quote_number, v_year, v_sequence_number,
        'draft', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
        'Presupuesto - ' || COALESCE(NULLIF(r.customer_name, ''), 'Cliente'),
        v_currency, 'es',
        v_subtotal, v_tax_amount, v_total, r.id
      ) RETURNING id INTO v_quote_id;

      INSERT INTO public.quote_items (
        quote_id, company_id, line_number,
        description, quantity, unit_price, tax_rate, tax_amount,
        subtotal, total, service_id
      ) VALUES (
        v_quote_id, r.company_id, 1,
        v_service_name, 1, v_unit_price, v_service_tax_rate, v_line_tax,
        v_line_subtotal, v_line_total, v_service_id
      );

      UPDATE public.bookings SET quote_id = v_quote_id WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Backfill failed for booking %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- booking-driven-quote-lifecycle-ext — multi-tenant toggle
-- ============================================================================
-- Adds a per-tenant opt-out for the booking-driven quote/invoice lifecycle.
-- When companies.settings->>'quote_lifecycle_mode' = 'manual', the four
-- lifecycle triggers on public.bookings early-return without touching quotes
-- or invoices. Default is 'booking-driven' (preserves the v3 behavior for all
-- existing tenants).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- T1. Helper: read the tenant's lifecycle mode (default 'booking-driven').
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_company_quote_mode(p_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT c.settings->>'quote_lifecycle_mode'
     FROM public.companies c
     WHERE c.id = p_company_id),
    'booking-driven'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_company_quote_mode(uuid) TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- T2. Gate trg_auto_create_quote_on_booking (BEFORE INSERT on bookings).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_auto_create_quote_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  -- Tenant opt-out: do nothing if the company is in manual mode.
  IF public.get_company_quote_mode(NEW.company_id) = 'manual' THEN
    RETURN NEW;
  END IF;

  IF NEW.source = 'csv-doctoralia' THEN RETURN NEW; END IF;
  IF NEW.quote_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

  IF v_service_id IS NOT NULL THEN
    SELECT s.name, s.base_price, s.tax_rate
      INTO v_service_name, v_unit_price, v_service_tax_rate
    FROM public.services s WHERE s.id = v_service_id;
  END IF;

  v_service_name     := COALESCE(v_service_name, 'Servicio reservado');
  v_unit_price       := COALESCE(NULLIF(NEW.total_price, 0), v_unit_price, 0);
  v_service_tax_rate := COALESCE(v_service_tax_rate, 21);
  v_currency         := COALESCE(NEW.currency, 'EUR');

  v_line_subtotal := ROUND(v_unit_price, 2);
  v_line_tax      := ROUND(v_line_subtotal * v_service_tax_rate / 100.0, 2);
  v_line_total    := ROUND(v_line_subtotal + v_line_tax, 2);
  v_subtotal   := v_line_subtotal;
  v_tax_amount := v_line_tax;
  v_total      := v_line_total;

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_sequence_number
  FROM public.quotes
  WHERE company_id = NEW.company_id AND year = v_year;
  v_quote_number := v_sequence_number::text;

  INSERT INTO public.quotes (
    company_id, client_id,
    quote_number, year, sequence_number,
    status, quote_date, valid_until,
    title, currency, language,
    subtotal, tax_amount, total_amount, booking_id
  ) VALUES (
    NEW.company_id, NEW.client_id,
    v_quote_number, v_year, v_sequence_number,
    'draft', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    'Presupuesto - ' || COALESCE(NULLIF(NEW.customer_name, ''), 'Cliente'),
    v_currency, 'es',
    v_subtotal, v_tax_amount, v_total, NEW.id
  )
  RETURNING id INTO v_quote_id;

  INSERT INTO public.quote_items (
    quote_id, company_id, line_number,
    description, quantity, unit_price, tax_rate, tax_amount,
    subtotal, total, service_id
  ) VALUES (
    v_quote_id, NEW.company_id, 1,
    v_service_name, 1, v_unit_price, v_service_tax_rate, v_line_tax,
    v_line_subtotal, v_line_total, v_service_id
  );

  UPDATE public.bookings SET quote_id = v_quote_id WHERE id = NEW.id;
  IF (NEW.total_price IS DISTINCT FROM v_unit_price) AND COALESCE(NEW.total_price, 0) = 0 THEN
    UPDATE public.bookings SET total_price = v_unit_price WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- T3. Gate trg_session_close_to_invoice (AFTER INSERT OR UPDATE on bookings).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_session_close_to_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Tenant opt-out: do nothing if the company is in manual mode.
  IF public.get_company_quote_mode(NEW.company_id) = 'manual' THEN
    RETURN NEW;
  END IF;

  IF NEW.start_time < now() OR NEW.session_confirmed_at IS NOT NULL THEN
    PERFORM public.accept_quote_for_booking(NEW.id);
    PERFORM public.create_invoice_for_booking(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- T4. Gate trg_cancel_booking_rejects_quote (AFTER UPDATE on bookings).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_cancel_booking_rejects_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Tenant opt-out: do nothing if the company is in manual mode.
  IF public.get_company_quote_mode(NEW.company_id) = 'manual' THEN
    RETURN NEW;
  END IF;

  -- Only fire on the transition INTO cancelled
  IF NEW.status IS DISTINCT FROM 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'cancelled' THEN
    RETURN NEW; -- already cancelled, nothing to do
  END IF;

  -- Only for FUTURE bookings: the session hasn't started yet
  IF NEW.start_time IS NULL OR NEW.start_time <= now() THEN
    RETURN NEW;
  END IF;

  -- Mark the linked quote as 'cancelled' (the booking was cancelled, quote stays as audit)
  -- Idempotent: do not overwrite accepted/invoiced (commercial states that survived)
  IF NEW.quote_id IS NOT NULL THEN
    UPDATE public.quotes
    SET status = 'cancelled',
        rejected_at = COALESCE(rejected_at, now()),
        updated_at = now()
    WHERE id = NEW.quote_id
      AND status NOT IN ('accepted', 'invoiced');
  END IF;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- T5. Gate trg_delete_booking_rejects_quote (AFTER DELETE on bookings).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_delete_booking_rejects_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Tenant opt-out: do nothing if the company is in manual mode.
  IF public.get_company_quote_mode(OLD.company_id) = 'manual' THEN
    RETURN OLD;
  END IF;

  -- The FK will set quotes.booking_id = NULL automatically (ON DELETE SET NULL).
  -- We additionally mark the quote as 'cancelled' (the booking was cancelled/deleted, quote stays as audit).
  UPDATE public.quotes
  SET status      = 'cancelled',
      rejected_at = COALESCE(rejected_at, now()),
      updated_at  = now()
  WHERE booking_id = OLD.id
    AND status NOT IN ('accepted', 'invoiced');

  RETURN OLD;
END;
$function$;
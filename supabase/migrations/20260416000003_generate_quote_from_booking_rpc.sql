-- Migration: generate_quote_from_booking RPC
-- Creates a draft quote from a booking, with line items from the service price

CREATE OR REPLACE FUNCTION public.generate_quote_from_booking(
  p_booking_id uuid,
  p_trigger_source text DEFAULT 'crm_calendar'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking record;
  v_company_id uuid;
  v_client_id uuid;
  v_service_name text;
  v_service_price numeric;
  v_service_tax_rate numeric;
  v_quote_id uuid;
  v_quote_number integer;
  v_year integer;
  v_full_quote_number text;
  v_line_total numeric;
  v_tax_amount numeric;
  v_subtotal numeric;
  v_total numeric;
  v_created_by uuid;
  v_client_exists uuid;
BEGIN
  -- Load booking with service
  SELECT
    b.id, b.company_id, b.client_id, b.total_price,
    b.booking_type, b.start_time, b.end_time,
    b.customer_name, b.customer_email, b.currency,
    s.name as service_name, s.base_price as service_price,
    s.tax_rate as service_tax_rate
  INTO v_booking
  FROM public.bookings b
  LEFT JOIN public.services s ON s.id = b.service_id
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Booking not found');
  END IF;

  v_company_id := v_booking.company_id;
  v_client_id := v_booking.client_id;

  -- Authorization: caller must belong to the same company as the booking
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid() AND company_id = v_company_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Resolve client: use booking.client_id if set, otherwise look up or create by email
  IF v_client_id IS NULL AND v_booking.customer_email IS NOT NULL THEN
    SELECT id INTO v_client_exists
    FROM public.clients
    WHERE company_id = v_company_id AND email = v_booking.customer_email
    LIMIT 1;
    IF v_client_exists IS NOT NULL THEN
      v_client_id := v_client_exists;
    ELSE
      -- Create minimal client record
      INSERT INTO public.clients (company_id, name, email, created_by)
      VALUES (v_company_id, COALESCE(v_booking.customer_name, 'Cliente desde reserva'), v_booking.customer_email, NULL)
      RETURNING id INTO v_client_id;
    END IF;
  END IF;

  -- Get next quote number for this company/year
  v_year := EXTRACT(year FROM CURRENT_DATE);
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_quote_number
  FROM public.quotes
  WHERE company_id = v_company_id AND year = v_year;

  v_full_quote_number := v_year || '-P-' || LPAD(v_quote_number::text, 5, '0');

  -- Resolve created_by via profiles.role = 'owner' (not users.role)
  SELECT u.id INTO v_created_by
  FROM public.users u
  JOIN public.profiles p ON p.user_id = u.id
  WHERE u.company_id = v_company_id AND p.role = 'owner'
  LIMIT 1;

  IF v_created_by IS NULL THEN
    -- Fallback: any user in the company
    SELECT id INTO v_created_by
    FROM public.users
    WHERE company_id = v_company_id
    LIMIT 1;
  END IF;

  -- Calculate subtotal from booking price or service price
  IF v_booking.total_price IS NOT NULL AND v_booking.total_price > 0 THEN
    v_subtotal := v_booking.total_price;
  ELSIF v_booking.service_price IS NOT NULL AND v_booking.service_price > 0 THEN
    v_subtotal := v_booking.service_price;
  ELSE
    v_subtotal := 0;
  END IF;

  -- Tax calculation (default 21% if no service tax_rate)
  v_service_tax_rate := COALESCE(v_booking.service_tax_rate, 21);
  v_tax_amount := ROUND(v_subtotal * (v_service_tax_rate / 100), 2);
  v_total := v_subtotal + v_tax_amount;

  -- Insert draft quote (full_quote_number handled by DB trigger/function)
  INSERT INTO public.quotes (
    company_id, client_id, booking_id,
    quote_number, year, sequence_number,
    status, quote_date, valid_until,
    title, description,
    subtotal, tax_amount, total_amount,
    currency, language,
    created_by
  ) VALUES (
    v_company_id, v_client_id, p_booking_id,
    v_quote_number, v_year, v_quote_number,
    'draft', CURRENT_DATE, CURRENT_DATE + interval '30 days',
    'Presupuesto reserva ' || COALESCE(v_booking.service_name, v_booking.booking_type, 'Servicio'),
    'Presupuesto autogenerado desde reserva del ' || TO_CHAR(v_booking.start_time, 'DD/MM/YYYY HH24:MI') ||
    '. Cliente: ' || COALESCE(v_booking.customer_name, 'No especificado'),
    v_subtotal, v_tax_amount, v_total,
    COALESCE(v_booking.currency, 'EUR'), 'es',
    v_created_by
  ) RETURNING id, full_quote_number INTO v_quote_id, v_full_quote_number;

  -- Create quote item line if we have price
  IF v_subtotal > 0 THEN
    INSERT INTO public.quote_items (
      quote_id, company_id, line_order,
      description, quantity, unit_price,
      tax_rate, tax_amount, subtotal, total,
      service_id
    ) VALUES (
      v_quote_id, v_company_id, 1,
      COALESCE(v_booking.service_name, 'Reserva de servicio'),
      1, v_subtotal,
      v_service_tax_rate, v_tax_amount, v_subtotal, v_total,
      v_booking.service_id
    );
  END IF;

  -- Link booking to quote
  UPDATE public.bookings
  SET quote_id = v_quote_id, updated_at = CURRENT_TIMESTAMP
  WHERE id = p_booking_id;

  RETURN json_build_object(
    'success', true,
    'quote_id', v_quote_id,
    'quote_number', v_full_quote_number
  );

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'generate_quote_from_booking error for booking %: %', p_booking_id, SQLERRM;
  RETURN json_build_object('success', false, 'error', 'Error interno al generar presupuesto');
END;
$$;

COMMENT ON FUNCTION public.generate_quote_from_booking IS
'Creates a draft quote from a booking. Called by CRM when a booking is created from the calendar.
p_booking_id: UUID of the booking
p_trigger_source: string identifier for logging (e.g. crm_calendar, api, waitlist)
Returns: {success: bool, quote_id?: uuid, quote_number?: string, error?: string}';
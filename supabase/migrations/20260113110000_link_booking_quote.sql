-- Migration to add linking columns
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id);

ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.bookings(id);

-- Update the RPC again to populate these
CREATE OR REPLACE FUNCTION public.client_create_booking(
    p_company_id UUID,
    p_service_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client_id UUID;
    v_booking_id UUID;
    v_quote_id UUID;
    v_booking_type_id UUID;
    v_customer_name TEXT;
    v_customer_email TEXT;
    v_service RECORD;
    v_user_id UUID;
    -- Variables for Price Calculation
    v_price NUMERIC;
    v_company_settings RECORD;
    v_quote_number TEXT;
    v_sequence_number BIGINT;
    v_year INTEGER;
    v_tax_rate NUMERIC;
    v_prices_include_tax BOOLEAN;
    v_base_price NUMERIC;
    v_tax_amount NUMERIC;
    v_total_amount NUMERIC;
    v_discount_percent NUMERIC := 0;
BEGIN
    -- 1. Identify Client & Get Name/Email
    v_user_id := auth.uid();
    
    SELECT id, name || ' ' || COALESCE(apellidos, ''), email INTO v_client_id, v_customer_name, v_customer_email
    FROM public.clients
    WHERE auth_user_id = v_user_id AND company_id = p_company_id;

    IF v_client_id IS NULL THEN
        -- Link by email if needed
        SELECT c.id, c.name || ' ' || COALESCE(c.apellidos, ''), c.email INTO v_client_id, v_customer_name, v_customer_email
        FROM public.clients c
        JOIN public.client_portal_users cpu ON c.id = cpu.client_id
        WHERE cpu.company_id = p_company_id 
        AND cpu.email = (SELECT email FROM auth.users WHERE id = v_user_id);
    END IF;

    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client profile not found');
    END IF;

    -- 2. Verify Service & Get Booking Type
    SELECT * INTO v_service FROM public.services WHERE id = p_service_id;
    IF v_service IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Service not found');
    END IF;

    -- Get Default Booking Type (First one found)
    SELECT id INTO v_booking_type_id FROM public.booking_types WHERE company_id = p_company_id LIMIT 1;
    
    -- 3. Create Booking
    INSERT INTO public.bookings (
        company_id, service_id, client_id, start_time, end_time, status, booking_type_id, customer_name, customer_email
    ) VALUES (
        p_company_id, p_service_id, v_client_id, p_start_time, p_end_time, 'confirmed', v_booking_type_id, v_customer_name, v_customer_email
    ) RETURNING id INTO v_booking_id;

    -- Calculate Price
    -- Logic adapted from SupabaseServicesService (Angular) which uses 'base_price'
    v_price := COALESCE(v_service.base_price, 0);

    IF v_price > 0 THEN
        -- Get Tax Settings
        SELECT * INTO v_company_settings FROM public.company_settings WHERE company_id = p_company_id;
        v_prices_include_tax := COALESCE(v_company_settings.prices_include_tax, false);
        v_tax_rate := CASE WHEN COALESCE(v_company_settings.iva_enabled, true) THEN COALESCE(v_company_settings.iva_rate, 21.0) ELSE 0 END;

        IF v_prices_include_tax THEN
            v_total_amount := v_price;
            v_base_price := v_total_amount / (1 + v_tax_rate / 100.0);
            v_tax_amount := v_total_amount - v_base_price;
        ELSE
            v_base_price := v_price;
            v_tax_amount := v_base_price * (v_tax_rate / 100.0);
            v_total_amount := v_base_price + v_tax_amount;
        END IF;

        -- Generate Quote Number
        v_year := date_part('year', CURRENT_DATE);
        BEGIN
            v_sequence_number := public.get_next_quote_number(p_company_id, v_year);
        EXCEPTION WHEN OTHERS THEN
            v_sequence_number := (extract(epoch from now())::bigint);
        END;
        v_quote_number := v_year || '-P-' || lpad(v_sequence_number::text, 5, '0');

        -- Create Quote
        INSERT INTO public.quotes (
            company_id, client_id, year, sequence_number, quote_number, title, description,
            status, quote_date, valid_until, currency, subtotal, tax_amount, total_amount, created_by,
            booking_id -- LINK TO BOOKING
        ) VALUES (
            p_company_id, v_client_id, v_year, v_sequence_number, v_quote_number, v_service.name, 
            'Reserva Online: ' || p_start_time::text,
            'accepted', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'EUR',
            v_base_price, v_tax_amount, v_total_amount, v_user_id,
            v_booking_id -- Set booking_id
        ) RETURNING id INTO v_quote_id;

        -- Create Quote Item
        INSERT INTO public.quote_items (
            quote_id, company_id, line_number, description, quantity, unit_price, subtotal, tax_rate, tax_amount, total, service_id
        ) VALUES (
            v_quote_id, p_company_id, 1, v_service.name, 1, v_base_price, v_base_price, v_tax_rate, v_tax_amount, v_total_amount, p_service_id
        );

        -- Update Booking with Quote ID
        UPDATE public.bookings SET quote_id = v_quote_id WHERE id = v_booking_id;

    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id, 'quote_id', v_quote_id);

EXCEPTION WHEN OTHERS THEN
    -- If error, rollback is automatic in generic function, but we return error json
    -- Implicit rollback of the entire transaction block
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

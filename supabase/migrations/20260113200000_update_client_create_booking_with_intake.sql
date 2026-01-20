CREATE OR REPLACE FUNCTION public.client_create_booking(
    p_company_id UUID,
    p_service_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_form_responses JSONB DEFAULT NULL::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client_id UUID;
    v_booking_id UUID;
    v_quote_id UUID;
    v_service RECORD;
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
    v_user_id UUID;
BEGIN
    -- 1. Identify Client
    v_user_id := auth.uid();
    
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE auth_user_id = v_user_id AND company_id = p_company_id;

    IF v_client_id IS NULL THEN
        -- Fallback: Try to find by email in client_portal_users if auth_user_id not linked
        SELECT client_id INTO v_client_id
        FROM public.client_portal_users
        WHERE company_id = p_company_id 
        AND email = (SELECT email FROM auth.users WHERE id = v_user_id);
    END IF;

    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client profile not found');
    END IF;

    -- 2. Verify Service & Get Price
    SELECT * INTO v_service FROM public.services WHERE id = p_service_id;
    
    IF v_service IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Service not found');
    END IF;

    -- Calculate Price
    -- Logic adapted from client-request-service/index.ts
    v_price := COALESCE(v_service.base_price, v_service.price, 0);
    IF v_service.price_cents IS NOT NULL AND v_price = 0 THEN
        v_price := v_service.price_cents / 100.0;
    END IF;

    -- 3. Create Booking
    INSERT INTO public.bookings (
        company_id,
        service_id,
        client_id,
        start_time,
        end_time,
        status,
        created_by,
        title,
        form_responses -- Added field
    ) VALUES (
        p_company_id,
        p_service_id,
        v_client_id,
        p_start_time,
        p_end_time,
        'confirmed',
        v_user_id,
        v_service.name,
        p_form_responses -- Added value
    ) RETURNING id INTO v_booking_id;

    -- 4. Create Quote (if price > 0)
    IF v_price > 0 THEN
        -- Get Company Settings for Tax
        SELECT * INTO v_company_settings 
        FROM public.company_settings 
        WHERE company_id = p_company_id;

        v_prices_include_tax := COALESCE(v_company_settings.prices_include_tax, false);
        -- Default 21% if enabled, else 0
        IF COALESCE(v_company_settings.iva_enabled, true) THEN
            v_tax_rate := COALESCE(v_company_settings.iva_rate, 21.0);
        ELSE
            v_tax_rate := 0;
        END IF;

        -- Calculate Amounts
        IF v_prices_include_tax THEN
            -- Price includes tax. Extract tax.
            v_total_amount := v_price;
            v_base_price := v_total_amount / (1 + v_tax_rate / 100.0);
            v_tax_amount := v_total_amount - v_base_price;
        ELSE
            -- Price is base. Add tax.
            v_base_price := v_price;
            v_tax_amount := v_base_price * (v_tax_rate / 100.0);
            v_total_amount := v_base_price + v_tax_amount;
        END IF;

        -- Generate Quote Number
        v_year := date_part('year', CURRENT_DATE);
        
        BEGIN
            v_sequence_number := public.get_next_quote_number(p_company_id, v_year);
        EXCEPTION WHEN OTHERS THEN
            v_sequence_number := (extract(epoch from now())::bigint); -- Fallback
        END;

        v_quote_number := v_year || '-P-' || lpad(v_sequence_number::text, 5, '0');

        -- Insert Quote
        INSERT INTO public.quotes (
            company_id,
            client_id,
            year,
            sequence_number,
            quote_number,
            title,
            description,
            status,
            quote_date,
            valid_until,
            currency,
            subtotal,
            tax_amount,
            total_amount,
            created_by
        ) VALUES (
            p_company_id,
            v_client_id,
            v_year,
            v_sequence_number,
            v_quote_number,
            v_service.name,
            'Reserva Online: ' || p_start_time::text,
            'accepted', -- Created as accepted because it accompanies a confirmed booking
            CURRENT_DATE,
            CURRENT_DATE + INTERVAL '30 days',
            'EUR',
            v_base_price,
            v_tax_amount,
            v_total_amount,
            v_user_id
        ) RETURNING id INTO v_quote_id;

        -- Insert Quote Item
        INSERT INTO public.quote_items (
            quote_id,
            company_id,
            line_number,
            description,
            quantity,
            unit_price,
            subtotal,
            tax_rate,
            tax_amount,
            total,
            service_id
        ) VALUES (
            v_quote_id,
            p_company_id,
            1,
            v_service.name,
            1,
            v_base_price, -- Unit price (base)
            v_base_price, -- Subtotal (1 unit)
            v_tax_rate,
            v_tax_amount,
            v_total_amount,
            p_service_id
        );
        
        -- Try linking quote to booking if column exists or update logic
        BEGIN
            UPDATE public.bookings SET quote_id = v_quote_id WHERE id = v_booking_id;
        EXCEPTION WHEN OTHERS THEN
            NULL; -- Ignore if column doesn't exist
        END;

    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'quote_id', v_quote_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

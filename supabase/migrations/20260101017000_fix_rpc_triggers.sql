-- Fix pricing logic in contract_service_rpc to play nice with triggers
CREATE OR REPLACE FUNCTION "public"."contract_service_rpc"(
    p_service_id uuid,
    p_variant_id uuid DEFAULT NULL
) 
RETURNS jsonb
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_company_id uuid;
    v_client_id uuid;
    v_service_record record;
    v_variant_record record;
    v_base_price numeric;
    v_discount_percent numeric := 0;
    v_tax_percent numeric := 21;
    v_tax_amount numeric;
    v_subtotal_amount numeric;
    v_total_amount numeric;
    v_quote_id uuid;
    v_invoice_id uuid;
    v_title text;
    v_variant_name text;
    v_billing_period text := 'one-time';
    v_providers jsonb;
    v_first_pricing jsonb;
    v_quote_count integer;
    v_invoice_number_text text;
    v_current_year integer := extract(year from now())::integer;
    v_creator_id uuid;
    v_series_id uuid;
    v_series_code text;
    v_user_email text;
    v_existing_linked_client_id uuid;
    v_prices_include_tax boolean := false;
    v_company_settings jsonb;
    v_recurrence_type text := 'none';
    v_recurrence_interval integer := 1;
    v_unit_price_for_db numeric;
BEGIN
    -- 1. Get context
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
    END IF;

    SELECT id, email INTO v_creator_id, v_user_email FROM public.users WHERE id = v_user_id;

    -- SMART CLIENT RESOLUTION
    SELECT id, company_id INTO v_client_id, v_company_id
    FROM public.clients
    WHERE auth_user_id = v_user_id
    LIMIT 1;

    IF v_client_id IS NULL THEN
        SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
        SELECT id, company_id INTO v_client_id, v_company_id FROM public.clients WHERE email = v_user_email AND is_active = true LIMIT 1;
        IF v_client_id IS NOT NULL THEN
             UPDATE public.clients SET auth_user_id = v_user_id WHERE id = v_client_id AND auth_user_id IS NULL;
        END IF;
    END IF;

    IF v_company_id IS NULL OR v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se encontró perfil de cliente activo');
    END IF;

    -- 2. Load service & settings
    SELECT * INTO v_service_record FROM public.services WHERE id = p_service_id AND company_id = v_company_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Servicio no encontrado');
    END IF;

    SELECT settings INTO v_company_settings FROM public.companies WHERE id = v_company_id;
    v_prices_include_tax := COALESCE((v_company_settings->>'prices_include_tax')::boolean, false);
    v_tax_percent := COALESCE((v_company_settings->>'default_tax_percent')::numeric, 21);

    -- 3. Pricing Logic
    v_base_price := COALESCE(v_service_record.base_price, 0);
    v_title := v_service_record.name;

    IF p_variant_id IS NOT NULL THEN
        SELECT * INTO v_variant_record FROM public.service_variants WHERE id = p_variant_id AND service_id = p_service_id;
        IF v_variant_record.id IS NOT NULL THEN
            v_variant_name := COALESCE(v_variant_record.variant_name, 'Plan');
            v_title := v_service_record.name || ' - ' || v_variant_name;
            
            IF v_variant_record.pricing IS NOT NULL AND jsonb_array_length(v_variant_record.pricing) > 0 THEN
                v_first_pricing := v_variant_record.pricing->0;
                v_base_price := COALESCE((v_first_pricing->>'base_price')::numeric, (v_first_pricing->>'price')::numeric, v_base_price) ;
                v_discount_percent := COALESCE((v_first_pricing->>'discount_percentage')::numeric, v_variant_record.discount_percentage, 0);
                v_billing_period := COALESCE(v_first_pricing->>'billing_period', 'one-time');
            ELSE
                v_discount_percent := COALESCE(v_variant_record.discount_percentage, 0);
            END IF;
        END IF;
    END IF;

    -- Recurrence
    IF v_billing_period IN ('weekly', 'monthly', 'quarterly', 'yearly') THEN
        v_recurrence_type := v_billing_period;
        v_recurrence_interval := 1;
    ELSIF v_billing_period = 'one-time' THEN
        v_recurrence_type := 'none';
        v_recurrence_interval := 1;
    ELSE
        v_recurrence_type := 'none';
    END IF;

    -- 4. Calculate Totals CORRECTLY for Triggers
    -- Apply discount
    v_base_price := round((v_base_price * (1 - COALESCE(v_discount_percent, 0) / 100))::numeric, 2);

    IF v_prices_include_tax THEN
        -- If prices include tax, users see 259€ (v_base_price).
        -- We want the Quote Item to store Unit Price = 259 (so the trigger stripes tax).
        -- Trigger math: Base = Unit / (1+tax).
        -- So we send v_base_price as Unit Price.
        v_unit_price_for_db := v_base_price;
        
        -- Calculated purely for Quote Header (which triggers might also update, but let's be accurate)
        v_total_amount := v_base_price; 
        v_subtotal_amount := round((v_total_amount / (1 + v_tax_percent / 100))::numeric, 2);
        v_tax_amount := v_total_amount - v_subtotal_amount;
    ELSE
        -- If prices exclude tax, users see 214€ (Base). Tax is added on top.
        -- Trigger math: Base = Unit. Total = Base + Tax.
        v_unit_price_for_db := v_base_price;
        
        v_subtotal_amount := v_base_price;
        v_tax_amount := round((v_subtotal_amount * (v_tax_percent / 100))::numeric, 2);
        v_total_amount := v_subtotal_amount + v_tax_amount;
    END IF;

    -- 5. Providers
    SELECT jsonb_agg(provider) INTO v_providers FROM public.payment_integrations WHERE company_id = v_company_id AND is_active = true;
    v_providers := COALESCE(v_providers, '[]'::jsonb) || '["cash"]'::jsonb;

    -- 6. Create Quote
    v_quote_count := public.get_next_quote_number(v_company_id, v_current_year);

    INSERT INTO public.quotes (
        company_id, client_id, title, status, 
        quote_date, valid_until, total_amount, currency,
        discount_amount, discount_percent, subtotal, tax_amount,
        year, sequence_number, quote_number, created_by,
        recurrence_type, recurrence_interval, next_run_at
    ) VALUES (
        v_company_id, v_client_id, v_title, 'accepted',
        now(), now() + interval '7 days', v_total_amount, 'EUR',
        0, v_discount_percent, v_subtotal_amount, v_tax_amount,
        v_current_year, v_quote_count, v_current_year || '-' || LPAD(v_quote_count::text, 5, '0'), v_creator_id,
        v_recurrence_type, v_recurrence_interval, 
        CASE WHEN v_recurrence_type <> 'none' THEN now() + 
            CASE 
                WHEN v_recurrence_type = 'monthly' THEN interval '1 month'
                WHEN v_recurrence_type = 'quarterly' THEN interval '3 months'
                WHEN v_recurrence_type = 'yearly' THEN interval '1 year'
                WHEN v_recurrence_type = 'weekly' THEN interval '1 week'
                ELSE interval '1 month'
            END 
        ELSE NULL END
    ) RETURNING id INTO v_quote_id;

    -- INSERT ITEM with Correct Unit Price for Trigger
    INSERT INTO public.quote_items (
        quote_id, company_id, description, quantity, unit_price, 
        discount_percent, tax_rate, tax_amount, subtotal, total,
        line_number, service_id, variant_id, billing_period
    ) VALUES (
        v_quote_id, v_company_id, v_title, 1, 
        v_unit_price_for_db, -- Value adjusted for trigger expectations
        v_discount_percent, v_tax_percent, v_tax_amount, v_subtotal_amount, v_total_amount,
        1, p_service_id, p_variant_id, v_billing_period
    );

    -- 7. Create Invoice
    SELECT id, series_code INTO v_series_id, v_series_code FROM public.invoice_series WHERE company_id = v_company_id AND is_active = true ORDER BY is_default DESC LIMIT 1;
    v_invoice_number_text := public.get_next_invoice_number(v_series_id);

    INSERT INTO public.invoices (
        company_id, client_id, source_quote_id, status, invoice_type,
        invoice_date, due_date, total, currency,
        subtotal, tax_amount, created_by, gdpr_legal_basis,
        series_id, invoice_number, invoice_series
    ) VALUES (
        v_company_id, v_client_id, v_quote_id, 'draft', 'normal',
        now(), now() + interval '7 days', v_total_amount, 'EUR',
        v_subtotal_amount, v_tax_amount, v_creator_id, 'contract',
        v_series_id, v_invoice_number_text, v_series_code
    ) RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_items (
        invoice_id, description, quantity, unit_price, 
        discount_percent, tax_rate, tax_amount, subtotal, total,
        line_order, service_id
    ) VALUES (
        v_invoice_id, v_title, 1, 
        v_unit_price_for_db, -- Same logic for invoice triggers
        v_discount_percent, v_tax_percent, v_tax_amount, v_subtotal_amount, v_total_amount,
        1, p_service_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'requires_payment_selection', true,
        'data', jsonb_build_object(
            'quote_id', v_quote_id,
            'invoice_id', v_invoice_id,
            'total', v_total_amount,
            'available_providers', v_providers,
            'message', 'Servicio preparado. Por favor, selecciona un método de pago.'
        )
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Migration to fix function signatures in RPC
-- Created on 2026-01-01-0017
-- V10 consolidated: 
-- 1. Fix get_next_quote_number(company_id, year)
-- 2. Fix get_next_invoice_number(series_id)
-- 3. Add series_id lookup and invoice sequence assignment

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
    v_tax_percent numeric := 21; -- Default 21%
    v_tax_amount numeric;
    v_total_amount numeric;
    v_quote_id uuid;
    v_invoice_id uuid;
    v_item_id uuid;
    v_title text;
    v_variant_name text;
    v_billing_period text := 'one-time';
    v_is_recurring boolean := false;
    v_providers jsonb;
    v_integration_record record;
    v_first_pricing jsonb;
    v_quote_count integer;
    v_invoice_count integer;
    v_current_year integer := extract(year from now())::integer;
    v_creator_id uuid;
    v_series_id uuid;
BEGIN
    -- 1. Get current user and context
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
    END IF;

    -- Check if user exists in public.users to satisfy foreign key constraints
    SELECT id INTO v_creator_id FROM public.users WHERE id = v_user_id;

    SELECT company_id, client_id INTO v_company_id, v_client_id
    FROM public.client_portal_users
    WHERE email = (SELECT email FROM auth.users WHERE id = v_user_id)
    AND is_active = true
    LIMIT 1;

    IF v_company_id IS NULL OR v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se encontró perfil de cliente activo');
    END IF;

    -- 2. Load service
    SELECT * INTO v_service_record FROM public.services WHERE id = p_service_id AND company_id = v_company_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Servicio no encontrado');
    END IF;

    -- 3. Calculate Base Price & Variant Logic
    v_base_price := COALESCE(v_service_record.base_price, 0);
    v_title := v_service_record.name;

    IF p_variant_id IS NOT NULL THEN
        SELECT * INTO v_variant_record
        FROM public.service_variants
        WHERE id = p_variant_id AND service_id = p_service_id;

        IF v_variant_record.id IS NOT NULL THEN
            v_variant_name := COALESCE(v_variant_record.variant_name, 'Plan');
            v_title := v_service_record.name || ' - ' || v_variant_name;
            
            IF v_variant_record.pricing IS NOT NULL AND jsonb_array_length(v_variant_record.pricing) > 0 THEN
                v_first_pricing := v_variant_record.pricing->0;
                
                v_base_price := COALESCE(
                    (v_first_pricing->>'base_price')::numeric, 
                    (v_first_pricing->>'price')::numeric, 
                    v_base_price
                );
                v_discount_percent := COALESCE((v_first_pricing->>'discount_percentage')::numeric, v_variant_record.discount_percentage, 0);
                v_billing_period := COALESCE(v_first_pricing->>'billing_period', 'one-time');
            ELSE
                v_discount_percent := COALESCE(v_variant_record.discount_percentage, 0);
            END IF;
            
            v_is_recurring := (v_billing_period != 'one-time');
        END IF;
    END IF;

    -- 4. Calculate Totals
    v_tax_amount := round((v_base_price * (1 - COALESCE(v_discount_percent, 0) / 100) * (v_tax_percent / 100))::numeric, 2);
    v_total_amount := round((v_base_price * (1 - COALESCE(v_discount_percent, 0) / 100) + v_tax_amount)::numeric, 2);

    -- 5. Check Payment Integrations
    SELECT jsonb_agg(provider) INTO v_providers
    FROM public.payment_integrations
    WHERE company_id = v_company_id AND is_active = true;

    v_providers := COALESCE(v_providers, '[]'::jsonb);
    v_providers := v_providers || '["cash"]'::jsonb;

    -- 6. Create Quote
    -- SIGNATURE FIX: (p_company_id uuid, p_year integer)
    v_quote_count := public.get_next_quote_number(v_company_id, v_current_year);

    INSERT INTO public.quotes (
        company_id, client_id, title, status, 
        quote_date, valid_until, total_amount, currency,
        discount_amount, discount_percent, subtotal, tax_amount,
        year, sequence_number, created_by, gdpr_legal_basis
    ) VALUES (
        v_company_id, v_client_id, v_title, 'accepted',
        now(), now() + interval '7 days', v_total_amount, 'EUR',
        (v_base_price * COALESCE(v_discount_percent, 0) / 100), v_discount_percent, v_base_price, v_tax_amount,
        v_current_year, v_quote_count, v_creator_id, 'contract'
    ) RETURNING id INTO v_quote_id;

    INSERT INTO public.quote_items (
        quote_id, company_id, description, quantity, unit_price, 
        discount_percent, tax_percent, tax_amount, subtotal, total,
        line_number
    ) VALUES (
        v_quote_id, v_company_id, v_title, 1, v_base_price,
        v_discount_percent, v_tax_percent, v_tax_amount, v_base_price, v_total_amount,
        1
    );

    -- 7. Create Invoice
    -- Get default series
    SELECT id INTO v_series_id FROM public.invoice_series WHERE company_id = v_company_id AND is_active = true ORDER BY is_default DESC LIMIT 1;
    
    -- SIGNATURE FIX: (p_series_id uuid)
    v_invoice_count := public.get_next_invoice_number(v_series_id);

    INSERT INTO public.invoices (
        company_id, client_id, quote_id, status, 
        invoice_date, due_date, total, currency,
        subtotal, tax_amount, discount_amount,
        year, sequence_number, created_by, gdpr_legal_basis,
        series_id
    ) VALUES (
        v_company_id, v_client_id, v_quote_id, 'pending',
        now(), now() + interval '7 days', v_total_amount, 'EUR',
        v_base_price, v_tax_amount, (v_base_price * COALESCE(v_discount_percent, 0) / 100),
        v_current_year, v_invoice_count, v_creator_id, 'contract',
        v_series_id
    ) RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_items (
        invoice_id, company_id, description, quantity, unit_price, 
        discount_percent, tax_percent, tax_amount, subtotal, total,
        line_number
    ) VALUES (
        v_invoice_id, v_company_id, v_title, 1, v_base_price,
        v_discount_percent, v_tax_percent, v_tax_amount, v_base_price, v_total_amount,
        1
    );

    -- 8. Final Response
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

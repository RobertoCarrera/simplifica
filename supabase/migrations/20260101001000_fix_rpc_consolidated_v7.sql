-- Migration to fix contract_service_rpc items columns (FINAL V7 - THE ABSOLUTE FINAL)
-- Fixes Consolidated:
-- 1. quote_items/invoice_items: sync column names (discount_percent, line_number, etc.)
-- 2. invoices: check created_by existence in public.users to avoid FK violation
-- 3. invoices: invoice_date naming and irpf_amount removal
-- 4. series/numbering: fix function signatures
-- Created on 2026-01-01-0010

CREATE OR REPLACE FUNCTION "public"."contract_service_rpc"(
    p_service_id uuid,
    p_variant_id uuid DEFAULT NULL
) 
RETURNS jsonb
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
    v_auth_user_id uuid;
    v_creator_id uuid;
    v_client_record record;
    v_service_record record;
    v_variant_record record;
    v_company_settings record;
    
    -- Price calculations
    v_base_price numeric := 0;
    v_discount_percent numeric := 0;
    v_billing_period text := 'one-time';
    v_is_recurring boolean := false;
    v_variant_name text;
    v_title text;
    
    v_unit_price numeric; -- Display price
    v_line_subtotal numeric; -- Accounting base
    v_tax_amount numeric;
    v_irpf_amount numeric;
    v_line_total numeric;
    v_discount_amount numeric;
    v_final_price numeric;
    v_accounting_base numeric;
    
    -- IDs
    v_quote_id uuid;
    v_quote_number text;
    v_invoice_id uuid;
    v_invoice_number text;
    v_invoice_series text;
    v_series_id uuid;
    
    -- Payment Integrations
    v_payment_methods text[] := ARRAY[]::text[];
    v_stripe_active boolean := false;
    v_paypal_active boolean := false;
    v_requires_payment boolean := false;
    
    -- Helper
    v_year integer;
    v_first_pricing jsonb;
BEGIN
    v_auth_user_id := auth.uid();
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;

    -- 1. Check if user exists in public.users for "created_by" FK
    SELECT id INTO v_creator_id FROM public.users WHERE id = v_auth_user_id;

    -- 2. Get Client & Company
    SELECT c.id, c.company_id, c.name, c.email
    INTO v_client_record
    FROM public.clients c
    WHERE c.auth_user_id = v_auth_user_id
    LIMIT 1;

    IF v_client_record.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User has no associated client profile');
    END IF;

    -- 3. Get Service
    SELECT * INTO v_service_record
    FROM public.services
    WHERE id = p_service_id;

    IF v_service_record.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Service not found');
    END IF;

    IF v_service_record.allow_direct_contracting IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Direct contracting is not enabled for this service');
    END IF;

    -- 4. Get Company Settings (Tax)
    SELECT * INTO v_company_settings
    FROM public.company_settings
    WHERE company_id = v_client_record.company_id;

    -- Defaults if settings not found
    IF v_company_settings.company_id IS NULL THEN
        v_company_settings := ROW(
            v_client_record.company_id,
            NULL, NULL, 21.0, true, 0.0, false, false, 'S'
        );
    END IF;

    -- 5. Calculate Base Price & Variant Logic
    v_base_price := COALESCE(v_service_record.base_price, 0);
    v_title := v_service_record.name;

    IF p_variant_id IS NOT NULL THEN
        SELECT * INTO v_variant_record
        FROM public.service_variants
        WHERE id = p_variant_id AND service_id = p_service_id;

        IF v_variant_record.id IS NOT NULL THEN
            v_variant_name := COALESCE(v_variant_record.variant_name, ''); 
            v_title := v_service_record.name || ' - ' || v_variant_name;
            
            IF v_variant_record.pricing IS NOT NULL AND jsonb_array_length(v_variant_record.pricing) > 0 THEN
                v_first_pricing := v_variant_record.pricing->0;
                v_base_price := COALESCE((v_first_pricing->>'base_price')::numeric, (v_first_pricing->>'price')::numeric, 0);
                v_discount_percent := COALESCE((v_first_pricing->>'discount_percentage')::numeric, 0);
                v_billing_period := COALESCE(v_first_pricing->>'billing_period', 'one-time');
            ELSE
                v_base_price := 0; 
                v_discount_percent := COALESCE(v_variant_record.discount_percentage, 0);
                v_billing_period := 'one-time';
            END IF;
            v_is_recurring := (v_billing_period != 'one-time');
        END IF;
    END IF;

    -- 6. Calculate Totals
    IF v_company_settings.prices_include_tax THEN
        v_unit_price := v_base_price;
        v_discount_amount := v_base_price * (v_discount_percent / 100.0);
        v_final_price := v_base_price - v_discount_amount;
        v_accounting_base := v_final_price / (1.0 + (COALESCE(v_company_settings.iva_rate, 21.0) / 100.0));
        v_line_subtotal := v_accounting_base;
        v_tax_amount := v_final_price - v_accounting_base;
        IF v_company_settings.irpf_enabled THEN
            v_irpf_amount := v_accounting_base * (COALESCE(v_company_settings.irpf_rate, 0) / 100.0);
        ELSE
            v_irpf_amount := 0;
        END IF;
        v_line_total := v_line_subtotal + v_tax_amount - v_irpf_amount;
    ELSE
        v_unit_price := v_base_price;
        v_discount_amount := v_base_price * (v_discount_percent / 100.0);
        v_line_subtotal := v_base_price - v_discount_amount;
        v_tax_amount := CASE WHEN v_company_settings.iva_enabled THEN v_line_subtotal * (COALESCE(v_company_settings.iva_rate, 21.0) / 100.0) ELSE 0 END;
        v_irpf_amount := CASE WHEN v_company_settings.irpf_enabled THEN v_line_subtotal * (COALESCE(v_company_settings.irpf_rate, 0) / 100.0) ELSE 0 END;
        v_line_total := v_line_subtotal + v_tax_amount - v_irpf_amount;
    END IF;
    
    v_unit_price := ROUND(v_unit_price, 2);
    v_discount_amount := ROUND(v_discount_amount, 2);
    v_line_subtotal := ROUND(v_line_subtotal, 2);
    v_tax_amount := ROUND(v_tax_amount, 2);
    v_irpf_amount := ROUND(v_irpf_amount, 2);
    v_line_total := ROUND(v_line_total, 2);

    -- 7. Generate Quote Number
    v_quote_number := public.get_next_quote_number(v_client_record.company_id, v_year);

    -- 8. Insert Quote
    INSERT INTO public.quotes (
        company_id, client_id, quote_number, year, sequence_number, 
        title, status, quote_date, valid_until,
        subtotal, discount_amount, tax_amount, total_amount,
        recurrence_type, recurrence_interval, recurrence_start_date, next_run_at, created_by
    ) VALUES (
        v_client_record.company_id, v_client_record.id, v_quote_number::integer, v_year, v_quote_number::integer, 
        v_title, 'accepted', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
        v_line_subtotal, 0, v_tax_amount, v_line_total,
        CASE WHEN v_is_recurring THEN 
             CASE 
                 WHEN v_billing_period = 'monthly' THEN 'monthly'
                 WHEN v_billing_period = 'quarterly' THEN 'quarterly'
                 WHEN v_billing_period = 'weekly' THEN 'weekly'
                 ELSE 'yearly'
             END
        ELSE 'none' END,
        1, CURRENT_DATE,
        CASE WHEN v_is_recurring THEN CURRENT_DATE + INTERVAL '1 month' ELSE NULL END, 
        v_creator_id -- Safe ID (NULL if not in public.users)
    ) RETURNING id INTO v_quote_id;

    -- 9. Insert Quote Item
    INSERT INTO public.quote_items (
        company_id, quote_id, line_number, service_id, variant_id, description, quantity, 
        unit_price, discount_percent, discount_amount, tax_rate, subtotal, tax_amount, total, billing_period
    ) VALUES (
        v_client_record.company_id, v_quote_id, 1, p_service_id, p_variant_id, v_title, 1,
        v_unit_price, v_discount_percent, v_discount_amount, COALESCE(v_company_settings.iva_rate, 21.0),
        v_line_subtotal, v_tax_amount, v_line_total, v_billing_period
    );

    -- 10. Create Invoice
    SELECT id, series_name INTO v_series_id, v_invoice_series
    FROM public.invoice_series WHERE company_id = v_client_record.company_id AND is_default = true LIMIT 1;
    IF v_series_id IS NULL THEN
         SELECT id, series_name INTO v_series_id, v_invoice_series FROM public.invoice_series WHERE company_id = v_client_record.company_id LIMIT 1;
    END IF;

    v_invoice_number := public.get_next_invoice_number(v_series_id);

    INSERT INTO public.invoices (
        company_id, client_id, series_id, invoice_series, invoice_number, status, invoice_date, due_date,
        subtotal, tax_amount, total, source_quote_id, created_by
    ) VALUES (
        v_client_record.company_id, v_client_record.id, v_series_id, v_invoice_series, v_invoice_number::integer,
        'draft', CURRENT_DATE, CURRENT_DATE + INTERVAL '7 days',
        v_line_subtotal, v_tax_amount, v_line_total, v_quote_id, v_creator_id -- Safe ID
    ) RETURNING id INTO v_invoice_id;

    -- 11. Invoice Items
    INSERT INTO public.invoice_items (
        invoice_id, service_id, description, quantity, unit_price, discount_percent, tax_rate, subtotal, tax_amount, total
    )
    SELECT v_invoice_id, service_id, description, quantity, unit_price, discount_percent, tax_rate, subtotal, tax_amount, total
    FROM public.quote_items WHERE quote_id = v_quote_id;

    -- 12. Response
    SELECT EXISTS(SELECT 1 FROM public.payment_integrations WHERE company_id = v_client_record.company_id AND provider = 'stripe' AND is_active = true) INTO v_stripe_active;
    SELECT EXISTS(SELECT 1 FROM public.payment_integrations WHERE company_id = v_client_record.company_id AND provider = 'paypal' AND is_active = true) INTO v_paypal_active;
    
    IF v_stripe_active THEN v_payment_methods := array_append(v_payment_methods, 'stripe'); END IF;
    IF v_paypal_active THEN v_payment_methods := array_append(v_payment_methods, 'paypal'); END IF;
    v_requires_payment := (array_length(v_payment_methods, 1) > 0);

    RETURN jsonb_build_object(
        'success', true,
        'action', 'contract',
        'requires_payment_selection', v_requires_payment,
        'data', jsonb_build_object(
            'invoice_id', v_invoice_id,
            'invoice_number', CASE WHEN v_invoice_series IS NOT NULL THEN v_invoice_series || '-' ELSE '' END || v_invoice_number,
            'quote_id', v_quote_id,
            'payment_methods', v_payment_methods,
            'message', 'Servicio contratado correctamente.'
        )
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

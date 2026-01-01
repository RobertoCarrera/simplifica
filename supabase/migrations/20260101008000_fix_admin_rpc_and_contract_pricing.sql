-- 1. Create missing Admin RPC for modules
CREATE OR REPLACE FUNCTION public.admin_list_user_modules(p_owner_id uuid DEFAULT NULL)
RETURNS TABLE (
    user_id uuid,
    email text,
    role text,
    modules jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Basic security check: ensure caller is admin/owner
    IF NOT public.check_user_role(auth.uid(), 'owner') AND NOT public.check_user_role(auth.uid(), 'admin') THEN
       RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        u.id,
        u.email,
        u.role,
        COALESCE(u.permissions, '{}'::jsonb) as modules
    FROM public.users u
    WHERE u.company_id = (SELECT company_id FROM public.users WHERE id = auth.uid());
END;
$$;

-- 2. Fix contract_service_rpc carefully
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
    v_tax_percent numeric := 21; -- Default 21%, should fetch from company settings if possible
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
BEGIN
    -- 1. Get context
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
    END IF;

    SELECT id, email INTO v_creator_id, v_user_email FROM public.users WHERE id = v_user_id;
    IF v_user_email IS NULL THEN
        SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    END IF;

    -- SMART CLIENT RESOLUTION (Improved):
    -- Priority 1: Client ALREADY linked to this auth_user_id
    SELECT id, company_id INTO v_client_id, v_company_id
    FROM public.clients
    WHERE auth_user_id = v_user_id
    LIMIT 1;

    -- Priority 2: Match by email ONLY if not already linked
    IF v_client_id IS NULL THEN
        SELECT id, company_id INTO v_client_id, v_company_id
        FROM public.clients
        WHERE email = v_user_email
        AND is_active = true
        LIMIT 1;
        
        -- Link ONLY if safe
        IF v_client_id IS NOT NULL THEN
             -- DOUBLE CHECK: Does this auth user have ANY other client?
             SELECT id INTO v_existing_linked_client_id FROM public.clients WHERE auth_user_id = v_user_id LIMIT 1;
             
             -- DOUBLE CHECK: Is this client already linked to someone else?
             -- (Implicitly handled by constraint, but good to check)
             
             IF v_existing_linked_client_id IS NULL THEN
                BEGIN
                    UPDATE public.clients
                    SET auth_user_id = v_user_id
                    WHERE id = v_client_id
                    AND auth_user_id IS NULL; -- Critical safety check
                EXCEPTION WHEN unique_violation THEN
                    -- Race condition or constraint hit: ignore update, just use the client (or fail if strict)
                    -- If we caught this, it means we ARE linked now (or someone is).
                    -- Let's re-fetch to be sure.
                    SELECT id, company_id INTO v_client_id, v_company_id FROM public.clients WHERE auth_user_id = v_user_id LIMIT 1;
                END;
             ELSE
                -- Weird edge case: User has a linked client (v_existing) but we found another by email (v_client_id).
                -- We must use the LINKED one to avoid jumping identities.
                v_client_id := v_existing_linked_client_id;
                SELECT company_id INTO v_company_id FROM public.clients WHERE id = v_client_id;
             END IF;
        END IF;
    END IF;

    IF v_company_id IS NULL OR v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se encontró perfil de cliente activo para el usuario ' || v_user_id::text);
    END IF;

    -- 2. Load service & settings
    SELECT * INTO v_service_record FROM public.services WHERE id = p_service_id AND company_id = v_company_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Servicio no encontrado. ID: ' || p_service_id::text || ', Company: ' || v_company_id::text);
    END IF;

    -- Get Company Tax Settings
    SELECT settings INTO v_company_settings FROM public.companies WHERE id = v_company_id;
    v_prices_include_tax := COALESCE((v_company_settings->>'prices_include_tax')::boolean, false);
    -- Defaults to 21% if not specified, Todo: fetch from config/settings if needed
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

    -- 4. Calculate Totals (Tax Inclusive vs Exclusive)
    -- Apply discount first on base
    v_base_price := round((v_base_price * (1 - COALESCE(v_discount_percent, 0) / 100))::numeric, 2);

    IF v_prices_include_tax THEN
        -- Price ALREADY has tax.
        -- Total = Base
        -- Subtotal = Total / (1 + tax)
        v_total_amount := v_base_price;
        v_subtotal_amount := round((v_total_amount / (1 + v_tax_percent / 100))::numeric, 2);
        v_tax_amount := v_total_amount - v_subtotal_amount;
    ELSE
        -- Price is Net.
        -- Subtotal = Base
        -- Tax = Subtotal * tax
        -- Total = Subtotal + Tax
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
        year, sequence_number, quote_number, created_by
    ) VALUES (
        v_company_id, v_client_id, v_title, 'accepted',
        now(), now() + interval '7 days', v_total_amount, 'EUR',
        0, v_discount_percent, v_subtotal_amount, v_tax_amount,
        v_current_year, v_quote_count, v_current_year || '-' || LPAD(v_quote_count::text, 5, '0'), v_creator_id
    ) RETURNING id INTO v_quote_id;

    INSERT INTO public.quote_items (
        quote_id, company_id, description, quantity, unit_price, 
        discount_percent, tax_rate, tax_amount, subtotal, total,
        line_number
    ) VALUES (
        v_quote_id, v_company_id, v_title, 1, 
        CASE WHEN v_prices_include_tax THEN v_subtotal_amount ELSE v_base_price END, -- Unit price usually net
        v_discount_percent, v_tax_percent, v_tax_amount, v_subtotal_amount, v_total_amount,
        1
    );

    -- 7. Create Invoice
    SELECT id, series_code INTO v_series_id, v_series_code 
    FROM public.invoice_series 
    WHERE company_id = v_company_id AND is_active = true 
    ORDER BY is_default DESC LIMIT 1;

    IF v_series_id IS NULL THEN
        RAISE EXCEPTION 'No active invoice series found for company %', v_company_id;
    END IF;

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
        line_order
    ) VALUES (
        v_invoice_id, v_title, 1, 
        CASE WHEN v_prices_include_tax THEN v_subtotal_amount ELSE v_base_price END,
        v_discount_percent, v_tax_percent, v_tax_amount, v_subtotal_amount, v_total_amount,
        1
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

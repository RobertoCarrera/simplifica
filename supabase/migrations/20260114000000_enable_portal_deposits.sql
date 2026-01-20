-- Helper function for Portal Deposit flow
-- Allows clients to self-convert quotes into invoices for payment

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_quote RECORD;
    v_invoice_id UUID;
    v_user_id UUID;
    v_series_id UUID;
    v_item RECORD;
BEGIN
    v_user_id := auth.uid();
    
    -- 1. Get Quote
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
    
    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Quote not found';
    END IF;

    -- 2. Authorization
    -- We allow conversion if the quote belongs to the client linked to the current user
    -- or if the user is an admin.
    -- Strict check:
    IF NOT (
        -- Is Admin/Owner
        EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id AND role IN ('admin', 'owner', 'superadmin') AND company_id = v_quote.company_id)
        OR
        -- Is Client linked to Quote
        (v_quote.client_id IN (SELECT id FROM public.clients WHERE auth_user_id = v_user_id))
        OR
        -- Is Portal User
        (v_quote.client_id IN (SELECT client_id FROM public.client_portal_users WHERE email = (SELECT email FROM auth.users WHERE id = v_user_id) AND company_id = v_quote.company_id))
    ) THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    -- 3. Get Invoice Series (Default)
    SELECT id INTO v_series_id 
    FROM public.invoice_series 
    WHERE company_id = v_quote.company_id AND is_default = true
    LIMIT 1;
    
    IF v_series_id IS NULL THEN
        -- Fallback
        SELECT id INTO v_series_id 
        FROM public.invoice_series 
        WHERE company_id = v_quote.company_id 
        LIMIT 1;
    END IF;

    -- 4. Create Invoice
    INSERT INTO public.invoices (
        company_id,
        client_id,
        series_id,
        invoice_type,
        invoice_date,
        due_date,
        status,
        payment_status,
        currency,
        subtotal,
        tax_amount,
        total,
        paid_amount,
        source_quote_id,
        created_by
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        v_series_id,
        'normal',
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '7 days',
        'draft',
        'pending',
        v_quote.currency,
        v_quote.subtotal,
        v_quote.tax_amount,
        v_quote.total_amount,
        0,
        v_quote.id,
        v_user_id
    ) RETURNING id INTO v_invoice_id;
    
    -- 5. Create Items
    FOR v_item IN SELECT * FROM public.quote_items WHERE quote_id = p_quote_id LOOP
        INSERT INTO public.invoice_items (
            invoice_id,
            line_order,
            description,
            quantity,
            unit_price,
            discount_percent,
            tax_rate,
            tax_amount,
            subtotal,
            total,
            service_id
        ) VALUES (
            v_invoice_id,
            v_item.line_number,
            v_item.description,
            v_item.quantity,
            v_item.unit_price,
            0,
            v_item.tax_rate,
            v_item.tax_amount,
            v_item.subtotal,
            v_item.total,
            v_item.service_id
        );
    END LOOP;
    
    RETURN v_invoice_id;
END;
$$;

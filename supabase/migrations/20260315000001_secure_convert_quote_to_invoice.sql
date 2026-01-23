-- Secure convert_quote_to_invoice Function
-- Replaces insecure dependency on users.company_id with strict company_members check.
-- Fixes hardcoded currency and tax rates.

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
DECLARE
    v_quote record;
    v_invoice_id UUID;
    v_user_id UUID;
    v_is_member BOOLEAN;
    v_client_id UUID;
BEGIN
    -- 1. Load the quote to see which company it belongs to
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- 2. Identify the caller
    -- Get public.users.id from auth.uid()
    SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = auth.uid();

    -- 3. Check permissions
    IF v_user_id IS NOT NULL THEN
        -- It's a staff member (User)
        -- Check if they are a member of the quote's company
        SELECT EXISTS (
            SELECT 1 FROM public.company_members
            WHERE user_id = v_user_id
              AND company_id = v_quote.company_id
              AND status = 'active'
        ) INTO v_is_member;

        IF NOT v_is_member THEN
             RAISE EXCEPTION 'Acceso denegado: No eres miembro activo de la empresa de este presupuesto';
        END IF;
    ELSE
        -- It might be a Client (Portal User)
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1;

        IF v_client_id IS NOT NULL THEN
            IF v_quote.client_id != v_client_id THEN
                 RAISE EXCEPTION 'Acceso denegado: No eres el titular de este presupuesto';
            END IF;
        ELSE
            RAISE EXCEPTION 'Usuario no identificado ni como miembro ni como cliente';
        END IF;
    END IF;

    -- 4. Conversion Logic
    INSERT INTO public.invoices (
        company_id, client_id, invoice_date, status, total, currency,
        invoice_type, notes
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        CURRENT_DATE,
        'draft',
        v_quote.total_amount,
        COALESCE(v_quote.currency, 'EUR'),
        'normal',
        'Generado desde presupuesto ' || v_quote.quote_number
    ) RETURNING id INTO v_invoice_id;

    -- Copiar items
    INSERT INTO public.invoice_items (
        invoice_id, description, quantity, unit_price, tax_rate, total
    )
    SELECT
        v_invoice_id,
        description,
        quantity,
        unit_price,
        COALESCE(tax_rate, 0),
        total
    FROM public.quote_items
    WHERE quote_id = p_quote_id;

    -- Marcar presupuesto como facturado
    UPDATE public.quotes
    SET status = 'invoiced', invoice_id = v_invoice_id
    WHERE id = p_quote_id;

    RETURN v_invoice_id;
END;
$$;

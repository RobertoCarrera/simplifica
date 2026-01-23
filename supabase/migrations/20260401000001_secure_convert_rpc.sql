-- 20260401000001_secure_convert_rpc.sql

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
DECLARE
    v_quote record;
    v_invoice_id UUID;
    v_client_id UUID;
    v_is_member boolean;
BEGIN
    -- Cargar el presupuesto
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- VALIDACIÓN DE SEGURIDAD ROBUSTA (Company Members)
    -- Verificar si el usuario es miembro activo de la compañía del presupuesto
    SELECT EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = v_quote.company_id
          AND cm.status = 'active'
    ) INTO v_is_member;

    -- Verificar si es cliente (Portal)
    IF NOT v_is_member THEN
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1;

        -- Caso Cliente: Debe ser el dueño del presupuesto
        IF v_client_id IS NOT NULL THEN
            IF v_quote.client_id != v_client_id THEN
                 RAISE EXCEPTION 'Acceso denegado: No eres el titular de este presupuesto';
            END IF;
        ELSE
            RAISE EXCEPTION 'Acceso denegado: No tienes permisos sobre este presupuesto';
        END IF;
    END IF;

    -- Insertar factura
    INSERT INTO public.invoices (
        company_id, client_id, invoice_date, status, total, currency,
        invoice_type, notes
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        CURRENT_DATE,
        'draft',
        v_quote.total_amount,
        COALESCE(v_quote.currency, 'EUR'), -- Usar moneda del presupuesto o fallback
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
        COALESCE(tax_rate, 0), -- Asegurar no nulo
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

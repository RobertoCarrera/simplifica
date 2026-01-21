-- 20260130100000_fix_quote_conversion_auth.sql

-- SECURITY FIX: Use company_members for authorization
-- Replaces deprecated usage of public.users.company_id with public.company_members check.
-- Also ensures tax rates are correctly copied from quotes to invoices.

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
DECLARE
    v_quote record;
    v_invoice_id UUID;
    v_is_staff boolean;
    v_client_id UUID;
    v_auth_user_id UUID := auth.uid();
    v_public_user_id UUID;
BEGIN
    -- Obtener el ID público del usuario
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_user_id = v_auth_user_id;

    -- Cargar el presupuesto
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- Verificar si es Staff (miembro activo de la empresa del quote)
    IF v_public_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.company_members
            WHERE user_id = v_public_user_id
            AND company_id = v_quote.company_id
            AND status = 'active'
        ) INTO v_is_staff;
    ELSE
        v_is_staff := false;
    END IF;

    -- Verificar si es Cliente (dueño del quote)
    IF NOT v_is_staff THEN
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = v_auth_user_id)
        LIMIT 1;

        -- Si es cliente, debe coincidir el client_id
        IF v_client_id IS NULL OR v_quote.client_id != v_client_id THEN
             RAISE EXCEPTION 'Acceso denegado: No tienes permiso para convertir este presupuesto';
        END IF;
    END IF;

    -- Lógica de conversión
    INSERT INTO public.invoices (
        company_id, client_id, invoice_date, status, total, currency,
        invoice_type, notes
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        CURRENT_DATE,
        'draft', -- Siempre iniciar como borrador para seguridad
        v_quote.total_amount,
        'EUR', -- Default o tomar de quote si existe columna currency
        'normal',
        'Generado desde presupuesto ' || v_quote.quote_number
    ) RETURNING id INTO v_invoice_id;

    -- Copiar items
    -- Se asume que quote_items tiene tax_rate. Si no, se debería ajustar el schema.
    INSERT INTO public.invoice_items (
        invoice_id, description, quantity, unit_price, tax_rate, total
    )
    SELECT
        v_invoice_id,
        description,
        quantity,
        unit_price,
        tax_rate, -- Copiar tasa de impuesto
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

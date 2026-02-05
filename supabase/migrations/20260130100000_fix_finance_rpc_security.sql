-- Fix convert_quote_to_invoice to use company_members instead of deprecated users.company_id

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
    v_has_access boolean;
    v_client_id UUID; -- ID del usuario autenticado si es cliente
BEGIN
    -- 1. Obtener ID interno del usuario
    SELECT id INTO v_user_id
    FROM public.users
    WHERE auth_user_id = auth.uid();

    -- 2. Cargar el presupuesto
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- 3. Validar acceso (Staff o Cliente)

    -- Caso A: Staff (Miembro de la empresa)
    -- Verificar si el usuario es miembro activo de la empresa del presupuesto
    SELECT EXISTS (
        SELECT 1 FROM public.company_members
        WHERE user_id = v_user_id
          AND company_id = v_quote.company_id
          AND status = 'active'
    ) INTO v_has_access;

    IF v_has_access THEN
        -- Es staff autorizado
        NULL; -- Continue
    ELSE
        -- Caso B: Cliente (Dueño del presupuesto)
        -- Si no es staff, verificamos si es el cliente asignado
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1;

        IF v_client_id IS NOT NULL AND v_quote.client_id = v_client_id THEN
            -- Es el cliente dueño
            NULL; -- Continue
        ELSE
            RAISE EXCEPTION 'Acceso denegado: No tienes permiso para convertir este presupuesto';
        END IF;
    END IF;

    -- Lógica original de conversión
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
    INSERT INTO public.invoice_items (
        invoice_id, description, quantity, unit_price, tax_rate, total
    )
    SELECT
        v_invoice_id,
        description,
        quantity,
        unit_price,
        0, -- Asumir 0 o calcular si existe tax en quote_items
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

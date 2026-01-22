-- 20260307000000_fix_quote_invoice_security.sql

-- MIGRACIÓN DE SEGURIDAD: CORRECCIÓN DE convert_quote_to_invoice
-- Objetivo: Reemplazar el uso de la columna depreciada users.company_id con public.company_members
-- y asegurar la correcta propagación de currency y tax_rate.

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
DECLARE
    v_quote record;
    v_invoice_id UUID;
    v_is_member boolean;
    v_client_id UUID;
BEGIN
    -- Cargar el presupuesto
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- 1. Verificar si es Miembro de la Compañía (Staff)
    -- Validamos contra company_members para asegurar que el usuario tenga acceso activo a ESTA compañía
    SELECT EXISTS (
        SELECT 1
        FROM public.users u
        JOIN public.company_members cm ON cm.user_id = u.id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = v_quote.company_id
          AND cm.status = 'active'
    ) INTO v_is_member;

    -- 2. Verificar si es Cliente (Portal)
    -- Si no es miembro, verificamos si es el cliente final
    IF NOT v_is_member THEN
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1;
    END IF;

    -- VALIDACIÓN DE SEGURIDAD
    IF v_is_member THEN
        -- Acceso permitido como Staff (Miembro activo de la empresa del presupuesto)
        NULL;
    ELSIF v_client_id IS NOT NULL THEN
        -- Caso Cliente: Debe ser el titular de este presupuesto específico
        IF v_quote.client_id != v_client_id THEN
             RAISE EXCEPTION 'Acceso denegado: No eres el titular de este presupuesto';
        END IF;
    ELSE
        RAISE EXCEPTION 'Usuario no autorizado para esta operación (ni miembro activo ni cliente titular)';
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
        COALESCE(v_quote.currency, 'EUR'), -- Usar moneda del presupuesto o fallback
        'normal',
        'Generado desde presupuesto ' || v_quote.quote_number
    ) RETURNING id INTO v_invoice_id;

    -- Copiar items
    -- Asumimos que quote_items tiene tax_rate, si no, usa 0
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

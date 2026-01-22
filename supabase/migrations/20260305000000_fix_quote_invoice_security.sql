-- 20260305000000_fix_quote_invoice_security.sql

-- MIGRACIÓN DE SEGURIDAD Y LOGICA FINANCIERA
-- Objetivo: Corregir corrupción de datos en conversión de presupuestos a facturas.
-- Riesgo previo: La función convert_quote_to_invoice forzaba tax_rate = 0.
-- Corrección: Mapear correctamente tax_rate y currency desde el presupuesto.

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
DECLARE
    v_quote record;
    v_invoice_id UUID;
    v_user_company_id UUID;
    v_client_id UUID; -- ID del usuario autenticado si es cliente
BEGIN
    -- Obtener company_id del usuario actual (si es staff)
    SELECT company_id INTO v_user_company_id
    FROM public.users
    WHERE auth_user_id = auth.uid();

    -- Si no es staff, verificar si es cliente (Portal)
    IF v_user_company_id IS NULL THEN
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1;
    END IF;

    -- Cargar el presupuesto
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- VALIDACIÓN DE SEGURIDAD
    IF v_user_company_id IS NOT NULL THEN
        -- Caso Staff: Debe pertenecer a la misma empresa
        IF v_quote.company_id != v_user_company_id THEN
             RAISE EXCEPTION 'Acceso denegado: El presupuesto pertenece a otra organización';
        END IF;
    ELSIF v_client_id IS NOT NULL THEN
        -- Caso Cliente: Debe ser el dueño del presupuesto
        IF v_quote.client_id != v_client_id THEN
             RAISE EXCEPTION 'Acceso denegado: No eres el titular de este presupuesto';
        END IF;
    ELSE
        RAISE EXCEPTION 'Usuario no autorizado para esta operación';
    END IF;

    -- Lógica de conversión corregida
    INSERT INTO public.invoices (
        company_id, client_id, invoice_date, status, total, currency,
        invoice_type, notes
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        CURRENT_DATE,
        'draft', -- Siempre iniciar como borrador para seguridad
        v_quote.total_amount,
        COALESCE(v_quote.currency, 'EUR'), -- FIX: Usar moneda del presupuesto
        'normal',
        'Generado desde presupuesto ' || v_quote.quote_number
    ) RETURNING id INTO v_invoice_id;

    -- Copiar items CORREGIDO
    INSERT INTO public.invoice_items (
        invoice_id, description, quantity, unit_price, tax_rate, total
    )
    SELECT
        v_invoice_id,
        description,
        quantity,
        unit_price,
        COALESCE(tax_rate, 0), -- FIX: Mapear tasa de impuesto real
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

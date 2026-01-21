-- 20260130000000_fix_finance_security_logic.sql

-- MIGRACIÓN DE CORRECCIÓN: FIX FINANCE SECURITY LOGIC
-- Objetivo: Corregir la función `convert_quote_to_invoice` que dependía de la columna deprecada `public.users.company_id`.
-- Solución: Validar la membresía del usuario usando la tabla `public.company_members`.

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
DECLARE
    v_quote record;
    v_invoice_id UUID;
    v_is_staff boolean := false;
    v_client_id UUID;
BEGIN
    -- 1. Cargar el presupuesto
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- 2. VALIDACIÓN DE SEGURIDAD (Multi-tenancy Robustness)

    -- Verificar si el usuario es miembro activo de la empresa del presupuesto (Staff)
    SELECT EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
          AND cm.company_id = v_quote.company_id
          AND cm.status = 'active'
    ) INTO v_is_staff;

    IF v_is_staff THEN
        -- Acceso Staff Concedido
        NULL; -- Continue
    ELSE
        -- Si no es staff, verificar si es cliente (Portal)
        -- Buscamos si el usuario actual coincide con el cliente del presupuesto
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1;

        IF v_client_id IS NOT NULL AND v_quote.client_id = v_client_id THEN
             -- Acceso Cliente Concedido
             NULL; -- Continue
        ELSE
             RAISE EXCEPTION 'Acceso denegado: No tienes permisos para convertir este presupuesto.';
        END IF;
    END IF;

    -- 3. Lógica de conversión (Idéntica a la anterior, solo cambia la validación)
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

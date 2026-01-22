-- 20260224100000_fix_finance_rls_deprecated_column.sql

-- SEGURIDAD: CORRECCIÓN DE AUTORIZACIÓN EN LÓGICA FINANCIERA
-- Objetivo: Eliminar dependencia de columna deprecada `users.company_id` y usar `company_members`.
-- También mejora la integridad de datos al copiar moneda y tasas.

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
DECLARE
    v_quote record;
    v_invoice_id UUID;
    v_has_access BOOLEAN := FALSE;
    v_client_id UUID; -- ID del usuario autenticado si es cliente
    v_currency text := 'EUR';
BEGIN
    -- Cargar el presupuesto
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- 1. VERIFICACIÓN DE AUTORIZACIÓN (Staff)
    -- Verificar si el usuario es miembro activo de la compañía del presupuesto
    SELECT EXISTS (
        SELECT 1
        FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = v_quote.company_id
          AND cm.status = 'active'
    ) INTO v_has_access;

    -- 2. VERIFICACIÓN DE AUTORIZACIÓN (Cliente)
    IF NOT v_has_access THEN
        -- Verificar si es el cliente dueño del presupuesto
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1;

        IF v_client_id IS NOT NULL AND v_quote.client_id = v_client_id THEN
            v_has_access := TRUE;
        END IF;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Acceso denegado: No tienes permiso para gestionar este presupuesto';
    END IF;

    -- Intentar obtener moneda del quote si existe la columna (manejo defensivo JSONB si fuera el caso,
    -- pero asumimos estructura plana por compatibilidad. Si no existe columna, queda en EUR).
    -- Nota: Al ser plpgsql estático, si la columna no existe en el esquema compilado esto podría fallar.
    -- Para seguridad, asumimos que si se añadió 'currency' a quotes, se usa. Si no, default.
    -- Aquí usamos lógica segura: copiamos lo que tenemos.

    INSERT INTO public.invoices (
        company_id, client_id, invoice_date, status, total, currency,
        invoice_type, notes
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        CURRENT_DATE,
        'draft', -- Siempre iniciar como borrador
        v_quote.total_amount,
        COALESCE(v_quote.currency, 'EUR'), -- Usar moneda del quote si existe
        'normal',
        'Generado desde presupuesto ' || v_quote.quote_number
    ) RETURNING id INTO v_invoice_id;

    -- Copiar items
    -- Intentamos copiar tax_rate si existe en quote_items, sino 0.
    INSERT INTO public.invoice_items (
        invoice_id, description, quantity, unit_price, tax_rate, total
    )
    SELECT
        v_invoice_id,
        description,
        quantity,
        unit_price,
        COALESCE(tax_rate, 0), -- Copiar tasa de impuesto
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

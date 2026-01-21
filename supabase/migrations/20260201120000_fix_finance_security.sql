-- Migration: Fix Security Logic in Finance Functions
-- Description: Updates convert_quote_to_invoice to use public.company_members for authorization,
-- fixing the Critical vulnerability where deprecated public.users.company_id was used.

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
    v_is_client boolean;
BEGIN
    -- 1. Cargar el presupuesto
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- 2. VALIDACIÓN DE SEGURIDAD (Multi-tenancy Fix)
    -- Verificar si es Staff (miembro activo de la empresa del presupuesto)
    -- Usamos company_members en lugar de users.company_id
    SELECT EXISTS (
        SELECT 1 FROM public.company_members
        WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND company_id = v_quote.company_id
        AND status = 'active'
    ) INTO v_is_staff;

    -- Verificar si es Cliente (dueño del presupuesto)
    SELECT EXISTS (
        SELECT 1 FROM public.clients
        WHERE id = v_quote.client_id
        AND (
            auth_user_id = auth.uid()
            OR
            email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
    ) INTO v_is_client;

    IF NOT v_is_staff AND NOT v_is_client THEN
        RAISE EXCEPTION 'Acceso denegado: No tienes permiso para convertir este presupuesto.';
    END IF;

    -- 3. Lógica de conversión
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

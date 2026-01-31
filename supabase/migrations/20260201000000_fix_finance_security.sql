-- 20260201000000_fix_finance_security.sql

-- MIGRACIÓN DE SEGURIDAD: CORRECCIÓN MULTI-TENANCY EN CONVERSIÓN DE PRESUPUESTOS
-- Objetivo: Reemplazar la validación basada en `users.company_id` (single-tenant legacy)
-- por una validación robusta contra `company_members` (multi-tenant support).

-- Asegurar existencia de la función auxiliar (Pattern: Re-declare helper)
CREATE OR REPLACE FUNCTION public.get_my_public_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_public_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_public_id() TO service_role;

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
    v_has_access boolean;
    v_is_client boolean := false;
BEGIN
    -- Cargar el presupuesto
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- VALIDACIÓN DE SEGURIDAD MULTI-TENANT
    -- 1. Verificar si es staff (miembro activo de la empresa del presupuesto)
    -- Utilizamos public.get_my_public_id() para evitar recursión y asegurar el mapeo correcto
    SELECT EXISTS (
        SELECT 1
        FROM public.company_members
        WHERE user_id = public.get_my_public_id()
          AND company_id = v_quote.company_id
          AND status = 'active'
    ) INTO v_has_access;

    -- 2. Si no es staff, verificar si es el cliente titular (Portal Cliente)
    -- Nota: Esto asume que el email en auth.users coincide con public.clients
    IF NOT v_has_access THEN
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1;

        IF v_client_id IS NOT NULL AND v_quote.client_id = v_client_id THEN
            v_has_access := true;
            v_is_client := true;
        END IF;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Acceso denegado: No tienes permiso para convertir este presupuesto.';
    END IF;

    -- Lógica de conversión (Preservada de la versión anterior)
    INSERT INTO public.invoices (
        company_id, client_id, invoice_date, status, total, currency,
        invoice_type, notes
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        CURRENT_DATE,
        'draft', -- Siempre iniciar como borrador
        v_quote.total_amount,
        'EUR',
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
        0, -- Asumir 0 o lógica de negocio existente
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

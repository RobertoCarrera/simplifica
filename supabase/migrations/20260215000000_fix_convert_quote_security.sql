-- 20260215000000_fix_convert_quote_security.sql

-- SECURITY FIX: Remove dependency on deprecated public.users.company_id
-- We redefine the function to strictly check company_members for staff access.

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
BEGIN
    -- 1. Load the quote first to know the context (company_id)
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- 2. Security Check: Is the user an ACTIVE STAFF member of the quote's company?
    -- We map auth.uid() -> public.users.id -> company_members
    SELECT EXISTS (
        SELECT 1
        FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = v_quote.company_id
          AND cm.status = 'active'
    ) INTO v_is_staff;

    -- 3. Security Check: Is the user the CLIENT owner of the quote?
    -- (Fallback for Client Portal access)
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    LIMIT 1;

    -- 4. Enforce Access Control
    IF v_is_staff THEN
        -- Allowed: User is active staff of the company that owns the quote
        NULL;
    ELSIF v_client_id IS NOT NULL AND v_quote.client_id = v_client_id THEN
        -- Allowed: User is the client who owns the quote
        NULL;
    ELSE
        RAISE EXCEPTION 'Acceso denegado: No tienes permiso para gestionar este presupuesto';
    END IF;

    -- 5. Perform Conversion (Logic maintained from previous version)
    INSERT INTO public.invoices (
        company_id, client_id, invoice_date, status, total, currency,
        invoice_type, notes
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        CURRENT_DATE,
        'draft', -- Start as draft for safety
        v_quote.total_amount,
        'EUR', -- Should ideally come from quote if available
        'normal',
        'Generado desde presupuesto ' || v_quote.quote_number
    ) RETURNING id INTO v_invoice_id;

    -- Copy items
    INSERT INTO public.invoice_items (
        invoice_id, description, quantity, unit_price, tax_rate, total
    )
    SELECT
        v_invoice_id,
        description,
        quantity,
        unit_price,
        0, -- Defaulting tax to 0 if not available in quote_items (schema dependent)
        total
    FROM public.quote_items
    WHERE quote_id = p_quote_id;

    -- Update quote status
    UPDATE public.quotes
    SET status = 'invoiced', invoice_id = v_invoice_id
    WHERE id = p_quote_id;

    RETURN v_invoice_id;
END;
$$;

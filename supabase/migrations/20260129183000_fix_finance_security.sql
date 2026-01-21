-- 20260129183000_fix_finance_security.sql

-- SECURITY FIX: Robust Quote to Invoice Conversion
-- Replaces previous vulnerable implementation to use modern auth patterns and fix tax data loss.

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
    v_is_member BOOLEAN;
    v_client_id UUID;
BEGIN
    -- 1. Get Public User ID
    v_user_id := public.get_my_public_id();

    -- 2. Load the quote
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- 3. Authorization Check
    IF v_user_id IS NOT NULL THEN
        -- Case Staff: Must be an ACTIVE member of the quote's company
        SELECT EXISTS (
            SELECT 1 FROM public.company_members
            WHERE user_id = v_user_id
            AND company_id = v_quote.company_id
            AND status = 'active'
        ) INTO v_is_member;

        IF NOT v_is_member THEN
             RAISE EXCEPTION 'Acceso denegado: No tienes acceso a esta organización';
        END IF;
    ELSE
        -- Case Client (Portal): Must be the owner of the quote
        -- Assuming auth.uid() matches a client record email (legacy pattern used in previous function)
        -- Ideally clients should verify via RLS, but in RPC we need explicit check if bypassing RLS
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND company_id = v_quote.company_id
        LIMIT 1;

        IF v_client_id IS NULL OR v_quote.client_id != v_client_id THEN
             RAISE EXCEPTION 'Acceso denegado: No eres el titular de este presupuesto';
        END IF;
    END IF;

    -- 4. Create Invoice
    INSERT INTO public.invoices (
        company_id, client_id, invoice_date, status, total, currency,
        invoice_type, notes
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        CURRENT_DATE,
        'draft', -- Start as draft for safety
        v_quote.total_amount,
        'EUR', -- Default or from quote if available
        'normal',
        'Generado desde presupuesto ' || v_quote.quote_number
    ) RETURNING id INTO v_invoice_id;

    -- 5. Copy Items (FIX: Include tax_rate)
    INSERT INTO public.invoice_items (
        invoice_id, description, quantity, unit_price, tax_rate, total
    )
    SELECT
        v_invoice_id,
        description,
        quantity,
        unit_price,
        COALESCE(tax_rate, 0), -- Fix: Preserve tax rate
        total
    FROM public.quote_items
    WHERE quote_id = p_quote_id;

    -- 6. Update Quote Status
    UPDATE public.quotes
    SET status = 'invoiced', invoice_id = v_invoice_id
    WHERE id = p_quote_id;

    RETURN v_invoice_id;
END;
$$;

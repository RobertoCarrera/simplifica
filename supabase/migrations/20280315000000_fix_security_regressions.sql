-- 20280315000000_fix_security_regressions.sql

-- 1. Fix RLS on company_members
-- The previous policy assumed user_id = auth.uid(), but user_id is public.users.id (UUID) and auth.uid() is auth.users.id (UUID).
-- While they are both UUIDs, they are different values. public.users has auth_user_id linking them.

DROP POLICY IF EXISTS "Users can view own memberships" ON public.company_members;

CREATE POLICY "Users can view own memberships" ON public.company_members
    FOR SELECT USING (
        user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- 2. Secure convert_quote_to_invoice RPC
-- Remove reliance on deprecated public.users.company_id column.

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
DECLARE
    v_quote record;
    v_invoice_id UUID;
    v_public_user_id UUID;
    v_is_member BOOLEAN;
    v_client_id UUID;
BEGIN
    -- Get public user id
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_user_id = auth.uid();

    -- Check if user is a client (Portal access)
    IF v_public_user_id IS NULL THEN
         -- Maybe purely auth user without public profile? Unlikely in this app.
         -- Try to find client by email
         SELECT id INTO v_client_id
         FROM public.clients
         WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
         LIMIT 1;
    END IF;

    -- Load Quote
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- SECURITY CHECK
    IF v_public_user_id IS NOT NULL THEN
        -- Check if user is a member of the quote's company
        SELECT EXISTS (
            SELECT 1 FROM public.company_members
            WHERE user_id = v_public_user_id
              AND company_id = v_quote.company_id
              AND status = 'active'
        ) INTO v_is_member;

        IF NOT v_is_member THEN
             -- Fallback: Check if they are a client linked to this quote?
             -- Original logic had a client check.
             -- If not member, maybe they are the client (if logged in as client)
             SELECT id INTO v_client_id
             FROM public.clients
             WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
             LIMIT 1;

             IF v_client_id IS NOT NULL AND v_quote.client_id = v_client_id THEN
                -- Allowed as client
             ELSE
                RAISE EXCEPTION 'Acceso denegado: No perteneces a la organización de este presupuesto';
             END IF;
        END IF;
    ELSIF v_client_id IS NOT NULL THEN
        -- Client Check
        IF v_quote.client_id != v_client_id THEN
             RAISE EXCEPTION 'Acceso denegado: No eres el titular de este presupuesto';
        END IF;
    ELSE
        RAISE EXCEPTION 'Usuario no autorizado';
    END IF;

    -- Conversion Logic (Same as before)
    INSERT INTO public.invoices (
        company_id, client_id, invoice_date, status, total, currency,
        invoice_type, notes
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        CURRENT_DATE,
        'draft',
        v_quote.total_amount,
        'EUR',
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
        0,
        total
    FROM public.quote_items
    WHERE quote_id = p_quote_id;

    -- Mark quote as invoiced
    UPDATE public.quotes
    SET status = 'invoiced', invoice_id = v_invoice_id
    WHERE id = p_quote_id;

    RETURN v_invoice_id;
END;
$$;

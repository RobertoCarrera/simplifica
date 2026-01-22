-- Fix Security Vulnerability in convert_quote_to_invoice
-- 1. Replaces deprecated public.users.company_id check with robust public.company_members validation.
-- 2. Correctly maps currency and tax_rate from quote/items instead of hardcoding values.

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
DECLARE
    v_quote record;
    v_invoice_id UUID;
    v_auth_user_id UUID;
    v_has_access BOOLEAN;
    v_client_id UUID;
BEGIN
    v_auth_user_id := auth.uid();

    -- Load the quote
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- SECURITY CHECK: Verify access via company_members
    -- Check if the current user is an ACTIVE member of the quote's company
    SELECT EXISTS (
        SELECT 1
        FROM public.company_members cm
        JOIN public.users u ON u.id = cm.user_id
        WHERE u.auth_user_id = v_auth_user_id
          AND cm.company_id = v_quote.company_id
          AND cm.status = 'active'
    ) INTO v_has_access;

    -- If not a staff member, check if it's the client (Portal Access)
    IF NOT v_has_access THEN
         -- Attempt to resolve client based on auth email
         SELECT id INTO v_client_id
         FROM public.clients
         WHERE email = (SELECT email FROM auth.users WHERE id = v_auth_user_id)
         AND company_id = v_quote.company_id -- Ensure client belongs to the same company context
         LIMIT 1;

         IF v_client_id IS NOT NULL AND v_quote.client_id = v_client_id THEN
            v_has_access := TRUE;
         END IF;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Acceso denegado: No tienes permiso para convertir este presupuesto.';
    END IF;

    -- Create Invoice
    INSERT INTO public.invoices (
        company_id,
        client_id,
        invoice_date,
        status,
        total,
        currency,
        invoice_type,
        notes
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        CURRENT_DATE,
        'draft', -- Always draft
        v_quote.total_amount,
        COALESCE(v_quote.currency, 'EUR'), -- Use quote currency
        'normal',
        'Generado desde presupuesto ' || v_quote.quote_number
    ) RETURNING id INTO v_invoice_id;

    -- Copy items
    INSERT INTO public.invoice_items (
        invoice_id,
        description,
        quantity,
        unit_price,
        tax_rate,
        total
    )
    SELECT
        v_invoice_id,
        description,
        quantity,
        unit_price,
        COALESCE(tax_rate, 0), -- Correctly map tax_rate
        total
    FROM public.quote_items
    WHERE quote_id = p_quote_id;

    -- Update Quote Status
    UPDATE public.quotes
    SET status = 'invoiced', invoice_id = v_invoice_id
    WHERE id = p_quote_id;

    RETURN v_invoice_id;
END;
$$;

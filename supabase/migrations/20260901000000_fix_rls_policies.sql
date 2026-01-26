-- 20260901000000_fix_rls_policies.sql

-- SECURITY FIX: RLS & FINANCIAL LOGIC
-- 1. Fix UUID mismatch in Invoices/Quotes/CompanyMembers policies
-- 2. Secure child tables (invoice_items, quote_items)
-- 3. Update convert_quote_to_invoice to use company_members

-- ==============================================================================
-- 1. FIX INVOICES POLICIES
-- ==============================================================================

DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_policy" ON public.invoices;

CREATE POLICY "invoices_select_policy" ON public.invoices
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
        )
        AND deleted_at IS NULL
    );

CREATE POLICY "invoices_insert_policy" ON public.invoices
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "invoices_update_policy" ON public.invoices
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
        )
        AND deleted_at IS NULL
    );

CREATE POLICY "invoices_delete_policy" ON public.invoices
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- ==============================================================================
-- 2. FIX QUOTES POLICIES
-- ==============================================================================

DROP POLICY IF EXISTS "quotes_select_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy_new" ON public.quotes;

CREATE POLICY "quotes_select_policy" ON public.quotes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_insert_policy" ON public.quotes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_update_policy" ON public.quotes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_delete_policy" ON public.quotes
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- ==============================================================================
-- 3. SECURE CHILD TABLES (invoice_items, quote_items)
-- ==============================================================================

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_access_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "quote_items_access_policy" ON public.quote_items;

CREATE POLICY "invoice_items_access_policy" ON public.invoice_items
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

CREATE POLICY "quote_items_access_policy" ON public.quote_items
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

-- ==============================================================================
-- 4. FIX CONVERT_QUOTE_TO_INVOICE (Remove dependency on users.company_id)
-- ==============================================================================

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
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = auth.uid();
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    SELECT true INTO v_is_member
    FROM public.company_members cm
    WHERE cm.company_id = v_quote.company_id
    AND cm.user_id = v_user_id
    AND cm.status = 'active'
    LIMIT 1;

    SELECT id INTO v_client_id
    FROM public.clients
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    LIMIT 1;

    IF v_is_member THEN
        -- Allowed
    ELSIF v_client_id IS NOT NULL THEN
        IF v_quote.client_id != v_client_id THEN
             RAISE EXCEPTION 'Acceso denegado';
        END IF;
    ELSE
        RAISE EXCEPTION 'Usuario no autorizado';
    END IF;

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

    UPDATE public.quotes
    SET status = 'invoiced', invoice_id = v_invoice_id
    WHERE id = p_quote_id;

    RETURN v_invoice_id;
END;
$$;

-- ==============================================================================
-- 5. FIX COMPANY_MEMBERS RLS (Ensure self-access works)
-- ==============================================================================

CREATE POLICY "company_members_self_access_fix" ON public.company_members
FOR SELECT USING (
    user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
);

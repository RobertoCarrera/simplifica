-- 20260201000000_audit_security_fixes.sql

-- 1. FIX RLS on INVOICES (SELECT & DELETE)
-- Previous policies had UUID mismatch (user_id vs auth.uid())

DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;
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

DROP POLICY IF EXISTS "invoices_delete_policy" ON public.invoices;
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

-- 2. FIX RLS on QUOTES (ALL)
-- Previous policies had UUID mismatch

DROP POLICY IF EXISTS "quotes_select_policy_new" ON public.quotes;
CREATE POLICY "quotes_select_policy" ON public.quotes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "quotes_insert_policy_new" ON public.quotes;
CREATE POLICY "quotes_insert_policy" ON public.quotes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "quotes_update_policy_new" ON public.quotes;
CREATE POLICY "quotes_update_policy" ON public.quotes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "quotes_delete_policy_new" ON public.quotes;
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

-- 3. SECURE CHILD TABLES (Items)

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Invoice Items Policy (View/Modify if you can View/Modify Invoice)
DROP POLICY IF EXISTS "invoice_items_policy_all" ON public.invoice_items;
CREATE POLICY "invoice_items_policy_all" ON public.invoice_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_policy_all" ON public.quote_items;
CREATE POLICY "quote_items_policy_all" ON public.quote_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON cm.company_id = q.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

-- 4. FIX DEPRECATED LOGIC in convert_quote_to_invoice

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
    -- Obtener ID de usuario público
    SELECT id INTO v_user_id
    FROM public.users
    WHERE auth_user_id = auth.uid();

    -- Cargar el presupuesto
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- Verificar si es miembro de la empresa del presupuesto
    SELECT EXISTS (
        SELECT 1 FROM public.company_members
        WHERE user_id = v_user_id
        AND company_id = v_quote.company_id
        AND status = 'active'
    ) INTO v_is_member;

    IF v_is_member THEN
        -- OK, es staff
    ELSE
        -- Verificar si es cliente (Portal)
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1;

        IF v_client_id IS NOT NULL AND v_quote.client_id = v_client_id THEN
            -- OK, es cliente dueño
        ELSE
            RAISE EXCEPTION 'Acceso denegado: No tienes permisos sobre este presupuesto';
        END IF;
    END IF;

    -- Lógica original de conversión
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

    -- Copiar items
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

    -- Marcar presupuesto como facturado
    UPDATE public.quotes
    SET status = 'invoiced', invoice_id = v_invoice_id
    WHERE id = p_quote_id;

    RETURN v_invoice_id;
END;
$$;

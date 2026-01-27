-- Fix RLS Security Critical Issues (Sept 2027 Audit)
-- 1. Fix UUID mismatch in invoices/quotes policies
-- 2. Secure child tables (invoice_items, quote_items)

-- ==============================================================================
-- 1. INVOICES
-- ==============================================================================

DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_policy" ON public.invoices;

CREATE POLICY "invoices_select_policy" ON public.invoices
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
        )
        AND deleted_at IS NULL
    );

CREATE POLICY "invoices_insert_policy" ON public.invoices
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "invoices_update_policy" ON public.invoices
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
        AND deleted_at IS NULL
    );

CREATE POLICY "invoices_delete_policy" ON public.invoices
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- ==============================================================================
-- 2. QUOTES
-- ==============================================================================

DROP POLICY IF EXISTS "quotes_select_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy_new" ON public.quotes;

CREATE POLICY "quotes_select_policy_new" ON public.quotes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_insert_policy_new" ON public.quotes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_update_policy_new" ON public.quotes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_delete_policy_new" ON public.quotes
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- ==============================================================================
-- 3. CHILD TABLES (invoice_items, quote_items)
-- ==============================================================================

-- invoice_items
ALTER TABLE IF EXISTS public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
            AND EXISTS (
                SELECT 1 FROM public.company_members cm
                WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
                AND cm.company_id = i.company_id
                AND cm.status = 'active'
            )
        )
    );

CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
            AND EXISTS (
                SELECT 1 FROM public.company_members cm
                WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
                AND cm.company_id = i.company_id
                AND cm.status = 'active'
                AND cm.role IN ('owner', 'admin')
            )
        )
    );

CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
            AND EXISTS (
                SELECT 1 FROM public.company_members cm
                WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
                AND cm.company_id = i.company_id
                AND cm.status = 'active'
                AND cm.role IN ('owner', 'admin')
            )
        )
    );

CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
            AND EXISTS (
                SELECT 1 FROM public.company_members cm
                WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
                AND cm.company_id = i.company_id
                AND cm.status = 'active'
                AND cm.role IN ('owner', 'admin')
            )
        )
    );

-- quote_items
ALTER TABLE IF EXISTS public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;

CREATE POLICY "quote_items_select_policy" ON public.quote_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            WHERE q.id = quote_items.quote_id
            AND EXISTS (
                SELECT 1 FROM public.company_members cm
                WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
                AND cm.company_id = q.company_id
                AND cm.status = 'active'
            )
        )
    );

CREATE POLICY "quote_items_insert_policy" ON public.quote_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.quotes q
            WHERE q.id = quote_items.quote_id
            AND EXISTS (
                SELECT 1 FROM public.company_members cm
                WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
                AND cm.company_id = q.company_id
                AND cm.status = 'active'
            )
        )
    );

CREATE POLICY "quote_items_update_policy" ON public.quote_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            WHERE q.id = quote_items.quote_id
            AND EXISTS (
                SELECT 1 FROM public.company_members cm
                WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
                AND cm.company_id = q.company_id
                AND cm.status = 'active'
            )
        )
    );

CREATE POLICY "quote_items_delete_policy" ON public.quote_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            WHERE q.id = quote_items.quote_id
            AND EXISTS (
                SELECT 1 FROM public.company_members cm
                WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
                AND cm.company_id = q.company_id
                AND cm.status = 'active'
                AND cm.role IN ('owner', 'admin')
            )
        )
    );

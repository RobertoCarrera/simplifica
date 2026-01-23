-- 20260401000000_fix_security_rls.sql
-- SECURITY FIX: Enforce RLS on critical tables missing policies
-- Affected: invoice_items, quote_items, products, payment_integrations

-- ==============================================================================
-- 1. invoice_items (Child of invoices, needs JOIN)
-- ==============================================================================
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'employee') -- Employees can usually add items
        )
    );

DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'employee')
        )
    );

DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'employee')
        )
    );

-- ==============================================================================
-- 2. quote_items (Has company_id)
-- ==============================================================================
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
CREATE POLICY "quote_items_select_policy" ON public.quote_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = quote_items.company_id
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
CREATE POLICY "quote_items_insert_policy" ON public.quote_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = quote_items.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'employee')
        )
    );

DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
CREATE POLICY "quote_items_update_policy" ON public.quote_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = quote_items.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'employee')
        )
    );

DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;
CREATE POLICY "quote_items_delete_policy" ON public.quote_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = quote_items.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'employee')
        )
    );

-- ==============================================================================
-- 3. products (Has company_id)
-- ==============================================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_policy" ON public.products;
CREATE POLICY "products_select_policy" ON public.products
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = products.company_id
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "products_insert_policy" ON public.products;
CREATE POLICY "products_insert_policy" ON public.products
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = products.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'employee')
        )
    );

DROP POLICY IF EXISTS "products_update_policy" ON public.products;
CREATE POLICY "products_update_policy" ON public.products
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = products.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'employee')
        )
    );

DROP POLICY IF EXISTS "products_delete_policy" ON public.products;
CREATE POLICY "products_delete_policy" ON public.products
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = products.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'employee')
        )
    );

-- ==============================================================================
-- 4. payment_integrations (Has company_id, Highly Sensitive)
-- ==============================================================================
ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;

-- Only Owners and Admins should access payment integrations
DROP POLICY IF EXISTS "payment_integrations_select_policy" ON public.payment_integrations;
CREATE POLICY "payment_integrations_select_policy" ON public.payment_integrations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = payment_integrations.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin') -- Restricted to admins
        )
    );

DROP POLICY IF EXISTS "payment_integrations_insert_policy" ON public.payment_integrations;
CREATE POLICY "payment_integrations_insert_policy" ON public.payment_integrations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = payment_integrations.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "payment_integrations_update_policy" ON public.payment_integrations;
CREATE POLICY "payment_integrations_update_policy" ON public.payment_integrations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = payment_integrations.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "payment_integrations_delete_policy" ON public.payment_integrations;
CREATE POLICY "payment_integrations_delete_policy" ON public.payment_integrations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = payment_integrations.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

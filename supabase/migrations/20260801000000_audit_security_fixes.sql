-- Migration: Audit Security Fixes 2026-08
-- Description: Fixes critical RLS flaws in company_members and secures child/settings tables.

-- 1. FIX company_members RLS (UUID Mismatch)
-- The original policies compared user_id (public UUID) with auth.uid() (auth UUID).
-- We must map auth.uid() -> public.users.id via auth_user_id column.

DROP POLICY IF EXISTS "Users can view own memberships" ON public.company_members;
CREATE POLICY "Users can view own memberships" ON public.company_members
    FOR SELECT USING (
        user_id IN (
            SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Company admins can view members" ON public.company_members;
CREATE POLICY "Company admins can view members" ON public.company_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "Company admins can update members" ON public.company_members;
CREATE POLICY "Company admins can update members" ON public.company_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "Company admins can delete members" ON public.company_members;
CREATE POLICY "Company admins can delete members" ON public.company_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
        )
    );

-- 2. SECURE invoice_items (Child Table)
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
CREATE POLICY "invoice_items_select" ON public.invoice_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "invoice_items_modify" ON public.invoice_items;
CREATE POLICY "invoice_items_modify" ON public.invoice_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- 3. SECURE quote_items (Child Table)
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select" ON public.quote_items;
CREATE POLICY "quote_items_select" ON public.quote_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "quote_items_modify" ON public.quote_items;
CREATE POLICY "quote_items_modify" ON public.quote_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- 4. SECURE verifactu_settings
ALTER TABLE public.verifactu_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "verifactu_settings_admin_access" ON public.verifactu_settings;
CREATE POLICY "verifactu_settings_admin_access" ON public.verifactu_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = verifactu_settings.company_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.role IN ('owner', 'admin')
            AND cm.status = 'active'
        )
    );

-- 5. SECURE payment_integrations
ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_integrations_admin_access" ON public.payment_integrations;
CREATE POLICY "payment_integrations_admin_access" ON public.payment_integrations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = payment_integrations.company_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.role IN ('owner', 'admin')
            AND cm.status = 'active'
        )
    );

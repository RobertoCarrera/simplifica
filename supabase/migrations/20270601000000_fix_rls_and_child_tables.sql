-- Fix RLS Regressions and Secure Child Tables
-- Context: Fixes mismatch between auth.uid() and public.users.id
-- Context: Adds missing RLS to invoice_items and quote_items

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
            AND cm.role IN ('owner', 'admin', 'member', 'professional', 'agent')
        )
    );

CREATE POLICY "invoices_update_policy" ON public.invoices
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'member', 'professional', 'agent')
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
-- 2. FIX QUOTES POLICIES
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
-- 3. SECURE CHILD TABLES
-- ==============================================================================

-- Invoice Items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_access_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_modify_policy" ON public.invoice_items;

-- Unified policy: If you can see the invoice, you can see its items.
-- Since the invoice policy handles Company/User filtering, we just join.
CREATE POLICY "invoice_items_access_policy" ON public.invoice_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_items.invoice_id
        )
    );

-- Quote Items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_access_policy" ON public.quote_items;

CREATE POLICY "quote_items_access_policy" ON public.quote_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            WHERE q.id = quote_items.quote_id
        )
    );

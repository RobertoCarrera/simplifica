-- Migration: Restore and Fix RLS Security (Audit May 2027)
-- Description: Fixes company_members UUID mismatch and restores missing RLS on child tables.

-- 1. FIX company_members RLS
-- The previous policies were comparing auth.uid() directly to user_id, which is wrong.

DROP POLICY IF EXISTS "Users can view own memberships" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can view members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can update members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can delete members" ON public.company_members;

-- Corrected Policy: Users can view own memberships
CREATE POLICY "Users can view own memberships" ON public.company_members
    FOR SELECT USING (
        user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- Corrected Policy: Company admins can view members
CREATE POLICY "Company admins can view members" ON public.company_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
            AND requester.status = 'active'
        )
    );

-- Corrected Policy: Company admins can update members
CREATE POLICY "Company admins can update members" ON public.company_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
            AND requester.status = 'active'
        )
    );

-- Corrected Policy: Company admins can delete members
CREATE POLICY "Company admins can delete members" ON public.company_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
            AND requester.status = 'active'
        )
    );

-- 2. SECURE CHILD TABLES (invoice_items, quote_items)
-- These tables were missing RLS policies.

-- invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'member')
        )
    );

-- quote_items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;

CREATE POLICY "quote_items_select_policy" ON public.quote_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quote_items_insert_policy" ON public.quote_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "quote_items_update_policy" ON public.quote_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'member')
        )
    );

CREATE POLICY "quote_items_delete_policy" ON public.quote_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin', 'member')
        )
    );

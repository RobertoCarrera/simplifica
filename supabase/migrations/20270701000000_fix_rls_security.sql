-- Fix RLS Security Regression (July 2027)

-- 1. Fix company_members RLS UUID Mismatch
-- The issue: user_id is internal UUID, auth.uid() is Auth UUID. They are distinct.
-- We must link via public.users.auth_user_id.

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

-- 2. Secure Child Tables (invoice_items, quote_items)
-- Ensure RLS is enabled and policies exist.

ALTER TABLE IF EXISTS public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quote_items ENABLE ROW LEVEL SECURITY;

-- Invoice Items Policies
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

DROP POLICY IF EXISTS "invoice_items_insert" ON public.invoice_items;
CREATE POLICY "invoice_items_insert" ON public.invoice_items
    FOR INSERT WITH CHECK (
         EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.role IN ('owner', 'admin')
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "invoice_items_update" ON public.invoice_items;
CREATE POLICY "invoice_items_update" ON public.invoice_items
    FOR UPDATE USING (
         EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.role IN ('owner', 'admin')
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "invoice_items_delete" ON public.invoice_items;
CREATE POLICY "invoice_items_delete" ON public.invoice_items
    FOR DELETE USING (
         EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.role IN ('owner', 'admin')
            AND cm.status = 'active'
        )
    );

-- Quote Items Policies
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

DROP POLICY IF EXISTS "quote_items_insert" ON public.quote_items;
CREATE POLICY "quote_items_insert" ON public.quote_items
    FOR INSERT WITH CHECK (
         EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "quote_items_update" ON public.quote_items;
CREATE POLICY "quote_items_update" ON public.quote_items
    FOR UPDATE USING (
         EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "quote_items_delete" ON public.quote_items;
CREATE POLICY "quote_items_delete" ON public.quote_items
    FOR DELETE USING (
         EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.role IN ('owner', 'admin')
            AND cm.status = 'active'
        )
    );

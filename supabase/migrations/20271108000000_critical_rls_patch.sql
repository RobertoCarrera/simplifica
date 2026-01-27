-- Migration: Critical Security Patch (RLS Fixes)
-- Date: 2027-11-08
-- Description: Fixes company_members UUID mismatch and secures child tables.

-- 1. FIX company_members RLS Policy
-- The existing policy `user_id = auth.uid()` fails because public.users.id != auth.uid()
DROP POLICY IF EXISTS "Users can view own memberships" ON public.company_members;

CREATE POLICY "Users can view own memberships" ON public.company_members
    FOR SELECT USING (
        user_id IN (
            SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
    );

-- 2. SECURE invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete" ON public.invoice_items;

-- Select: Members can view items of their company's invoices
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

-- Insert: Members can insert items to their company's invoices
CREATE POLICY "invoice_items_insert" ON public.invoice_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

-- Update: Members can update items
CREATE POLICY "invoice_items_update" ON public.invoice_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

-- Delete: Members can delete items
CREATE POLICY "invoice_items_delete" ON public.invoice_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

-- 3. SECURE quote_items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "quote_items_select" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete" ON public.quote_items;

-- Select
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

-- Insert
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

-- Update
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

-- Delete
CREATE POLICY "quote_items_delete" ON public.quote_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.status = 'active'
        )
    );

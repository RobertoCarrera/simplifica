-- Secure Child Tables: invoice_items and quote_items
-- Migration ID: 20280305000000_secure_child_tables

-- 1. Enable RLS
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- 2. invoice_items Policies

-- Drop potential existing policies to ensure clean state
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
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

-- 3. quote_items Policies

-- Drop potential existing policies
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
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quote_items_insert_policy" ON public.quote_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quote_items_update_policy" ON public.quote_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quote_items_delete_policy" ON public.quote_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

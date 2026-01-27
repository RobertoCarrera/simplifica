-- Migration: Secure Child Tables (Invoice Items & Quote Items)
-- Fixes regression where child tables lost RLS protection.

-- 1. Secure invoice_items
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
        AND cm.role IN ('owner', 'admin') -- Restrict delete to admins
    )
);

-- 2. Secure quote_items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
CREATE POLICY "quote_items_select_policy" ON public.quote_items
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.quotes q
        JOIN public.company_members cm ON cm.company_id = q.company_id
        WHERE q.id = quote_items.quote_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'active'
    )
);

DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
CREATE POLICY "quote_items_insert_policy" ON public.quote_items
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.quotes q
        JOIN public.company_members cm ON cm.company_id = q.company_id
        WHERE q.id = quote_items.quote_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'active'
    )
);

DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
CREATE POLICY "quote_items_update_policy" ON public.quote_items
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.quotes q
        JOIN public.company_members cm ON cm.company_id = q.company_id
        WHERE q.id = quote_items.quote_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'active'
    )
);

DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;
CREATE POLICY "quote_items_delete_policy" ON public.quote_items
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.quotes q
        JOIN public.company_members cm ON cm.company_id = q.company_id
        WHERE q.id = quote_items.quote_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin')
    )
);

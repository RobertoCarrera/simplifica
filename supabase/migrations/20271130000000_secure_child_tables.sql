-- 20271130000000_secure_child_tables.sql
-- Fix RLS for child tables invoice_items and quote_items which were exposed due to regression

-- 1. Invoice Items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
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

DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

-- 2. Quote Items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
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

DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
CREATE POLICY "quote_items_insert_policy" ON public.quote_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
CREATE POLICY "quote_items_update_policy" ON public.quote_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;
CREATE POLICY "quote_items_delete_policy" ON public.quote_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

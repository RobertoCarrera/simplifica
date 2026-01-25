-- Migration: Secure Child Tables (Invoice/Quote Items) with correct Auth ID mapping

-- 1. Secure invoice_items
ALTER TABLE IF EXISTS public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE i.id = invoice_items.invoice_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
  )
);

CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE i.id = invoice_items.invoice_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin') -- Only staff can add items
  )
);

CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE i.id = invoice_items.invoice_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE i.id = invoice_items.invoice_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

-- 2. Secure quote_items
ALTER TABLE IF EXISTS public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;

CREATE POLICY "quote_items_select_policy" ON public.quote_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE q.id = quote_items.quote_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
  )
);

CREATE POLICY "quote_items_insert_policy" ON public.quote_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE q.id = quote_items.quote_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "quote_items_update_policy" ON public.quote_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE q.id = quote_items.quote_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "quote_items_delete_policy" ON public.quote_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE q.id = quote_items.quote_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

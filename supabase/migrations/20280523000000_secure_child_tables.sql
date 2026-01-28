-- Secure Child Tables: invoice_items and quote_items
-- Issue: These tables lacked RLS policies, allowing potential data leakage.

-- 1. Invoice Items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND (
      EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
        AND cm.company_id = i.company_id
        AND cm.status = 'active'
      )
    )
  )
);

DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
        AND cm.company_id = i.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin', 'member')
    )
  )
);

DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
        AND cm.company_id = i.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin', 'member')
    )
  )
);

DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
        AND cm.company_id = i.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin', 'member')
    )
  )
);

-- 2. Quote Items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
CREATE POLICY "quote_items_select_policy" ON public.quote_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
        AND cm.company_id = q.company_id
        AND cm.status = 'active'
    )
  )
);

DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
CREATE POLICY "quote_items_insert_policy" ON public.quote_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
        AND cm.company_id = q.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin', 'member')
    )
  )
);

DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
CREATE POLICY "quote_items_update_policy" ON public.quote_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
        AND cm.company_id = q.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin', 'member')
    )
  )
);

DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;
CREATE POLICY "quote_items_delete_policy" ON public.quote_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
        AND cm.company_id = q.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin', 'member')
    )
  )
);

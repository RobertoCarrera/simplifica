-- 20260701000000_secure_child_tables_v2.sql
-- SECURITY FIX: Enable RLS on child tables (invoice_items, quote_items)
-- Prevents IDOR by ensuring users can only access items belonging to invoices/quotes
-- they have access to via their company membership.

-- 1. INVOICE ITEMS
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = i.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
    )
  )
);

CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = i.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
        -- Optional: Check role ('owner', 'admin', 'employee' usually can edit)
    )
  )
);

CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = i.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
    )
  )
);

CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = i.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
    )
  )
);

-- 2. QUOTE ITEMS
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;

CREATE POLICY "quote_items_select_policy" ON public.quote_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = q.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
    )
  )
);

CREATE POLICY "quote_items_insert_policy" ON public.quote_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = q.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
    )
  )
);

CREATE POLICY "quote_items_update_policy" ON public.quote_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = q.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
    )
  )
);

CREATE POLICY "quote_items_delete_policy" ON public.quote_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = q.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
    )
  )
);

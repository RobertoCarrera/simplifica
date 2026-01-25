-- Secure Child Tables (Invoice Items & Quote Items)
-- Addresses Critical Vulnerability: Missing RLS on financial line items

-- 1. Invoice Items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

-- SELECT: Inherit visibility from parent invoice (Users & Clients)
CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
  )
);

-- INSERT/UPDATE/DELETE: Only Active Staff (Owner/Admin)
-- Explicitly JOIN company_members via invoice.company_id
CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

-- 2. Quote Items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;

-- SELECT: Inherit visibility from parent quote
CREATE POLICY "quote_items_select_policy" ON public.quote_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
  )
);

-- INSERT/UPDATE/DELETE: Only Active Staff (Owner/Admin)
CREATE POLICY "quote_items_insert_policy" ON public.quote_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "quote_items_update_policy" ON public.quote_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "quote_items_delete_policy" ON public.quote_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

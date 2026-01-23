-- Migration: Secure Invoice and Quote Items (RLS)
-- Objective: Prevent IDOR and cross-tenant access to line items.

-- 1. Secure invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to be safe)
DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

-- Select: Allow any active member of the company to view items
CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

-- Modifications: Only Owners/Admins can modify items (mirroring invoice rules)
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

-- 2. Secure quote_items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;

-- Select: Active members
CREATE POLICY "quote_items_select_policy" ON public.quote_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

-- Modifications: Owners/Admins
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

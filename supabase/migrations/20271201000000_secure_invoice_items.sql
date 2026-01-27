-- Migration: Secure Child Tables (Invoice Items & Quote Items)
-- Priority: Critical
-- Fixes missing RLS on financial line items

-- 1. Enable RLS
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- 2. Clean old policies
DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;

-- 3. Invoice Items Policies

CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
    -- Optional: Check role permissions if needed, but active membership is baseline
  )
);

CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin') -- Restrict deletion to admins
  )
);

-- 4. Quote Items Policies

CREATE POLICY "quote_items_select_policy" ON public.quote_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

CREATE POLICY "quote_items_insert_policy" ON public.quote_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

CREATE POLICY "quote_items_update_policy" ON public.quote_items
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

CREATE POLICY "quote_items_delete_policy" ON public.quote_items
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

-- 20271001000000_fix_rls_child_tables.sql

-- FIX: Secure child tables (invoice_items, quote_items) that lost RLS during regression.
-- This ensures that items can only be accessed if the user has access to the parent invoice/quote
-- via company membership.

-- 1. Enable RLS
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- 2. Drop potential existing permissive/broken policies
DROP POLICY IF EXISTS "invoice_items_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete" ON public.invoice_items;

DROP POLICY IF EXISTS "quote_items_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_select" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete" ON public.quote_items;

-- 3. Create unified policies linked to parent tables
-- Using 'FOR ALL' covers SELECT, INSERT, UPDATE, DELETE

CREATE POLICY "invoice_items_access_policy" ON public.invoice_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
);

CREATE POLICY "quote_items_access_policy" ON public.quote_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
);

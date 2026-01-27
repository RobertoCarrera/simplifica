-- Secure Child Tables Migration
-- Date: 2028-02-01
-- Purpose: Restore RLS on invoice_items and quote_items after regression.

-- 1. Secure invoice_items
ALTER TABLE IF EXISTS public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete" ON public.invoice_items;

CREATE POLICY "invoice_items_access" ON public.invoice_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
  )
);

-- 2. Secure quote_items
ALTER TABLE IF EXISTS public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete" ON public.quote_items;

CREATE POLICY "quote_items_access" ON public.quote_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
  )
);

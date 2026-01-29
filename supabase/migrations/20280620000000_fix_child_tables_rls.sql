-- Migration: Secure Child Tables (Invoice Items & Quote Items)
-- Priority: CRITICAL
-- Description: Enables RLS and adds policies linking to parent tables to prevent IDOR/Leakage.

-- 1. INVOICE ITEMS
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

-- Select: Access if parent invoice is accessible (Members OR Clients)
CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND (
      -- Company Members (via users mapping)
      EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE cm.company_id = i.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
      )
      OR
      -- Clients (via JWT email claim)
      EXISTS (
         SELECT 1 FROM public.clients c
         WHERE c.id = i.client_id
         AND c.email = (auth.jwt() ->> 'email')
      )
    )
  )
);

-- Insert: Only Company Members
CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE cm.company_id = i.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  )
);

-- Update: Only Company Members
CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE cm.company_id = i.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  )
);

-- Delete: Only Company Members
CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE cm.company_id = i.company_id
        AND u.auth_user_id = auth.uid()
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

-- Select: Access if parent quote is accessible (Members OR Clients)
CREATE POLICY "quote_items_select_policy" ON public.quote_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND (
      -- Company Members
      EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE cm.company_id = q.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
      )
      OR
      -- Clients
      EXISTS (
         SELECT 1 FROM public.clients c
         WHERE c.id = q.client_id
         AND c.email = (auth.jwt() ->> 'email')
      )
    )
  )
);

-- Insert: Only Company Members
CREATE POLICY "quote_items_insert_policy" ON public.quote_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE cm.company_id = q.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  )
);

-- Update: Only Company Members
CREATE POLICY "quote_items_update_policy" ON public.quote_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE cm.company_id = q.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  )
);

-- Delete: Only Company Members
CREATE POLICY "quote_items_delete_policy" ON public.quote_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE cm.company_id = q.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  )
);

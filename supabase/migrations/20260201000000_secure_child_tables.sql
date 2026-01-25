-- 20260201000000_secure_child_tables.sql

-- SECURITY MIGRATION: SECURE CHILD TABLES (INVOICE_ITEMS, QUOTE_ITEMS)
-- Objective: Enable RLS on child tables that lack company_id to prevent IDOR.
-- Strategy: Use delegated authorization via parent tables (invoices, quotes).

-- ==============================================================================
-- 1. Secure invoice_items
-- ==============================================================================

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (cleanup)
DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete" ON public.invoice_items;

-- SELECT: Active Staff OR Client Owner
CREATE POLICY "invoice_items_select" ON public.invoice_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND (
      -- Staff Check: User is an active member of the company that owns the invoice
      EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = i.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
      )
      OR
      -- Client Check: User is the client assigned to the invoice
      i.client_id = (SELECT id FROM public.clients WHERE email = (auth.jwt() ->> 'email'))
    )
  )
);

-- INSERT: Active Staff Only
CREATE POLICY "invoice_items_insert" ON public.invoice_items
FOR INSERT TO authenticated
WITH CHECK (
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

-- UPDATE: Active Staff Only
CREATE POLICY "invoice_items_update" ON public.invoice_items
FOR UPDATE TO authenticated
USING (
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
)
WITH CHECK (
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

-- DELETE: Active Staff Only
CREATE POLICY "invoice_items_delete" ON public.invoice_items
FOR DELETE TO authenticated
USING (
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

-- ==============================================================================
-- 2. Secure quote_items
-- ==============================================================================

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete" ON public.quote_items;

-- SELECT: Active Staff OR Client Owner
CREATE POLICY "quote_items_select" ON public.quote_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND (
      -- Staff Check
      EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = q.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
      )
      OR
      -- Client Check
      q.client_id = (SELECT id FROM public.clients WHERE email = (auth.jwt() ->> 'email'))
    )
  )
);

-- INSERT: Active Staff Only
CREATE POLICY "quote_items_insert" ON public.quote_items
FOR INSERT TO authenticated
WITH CHECK (
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

-- UPDATE: Active Staff Only
CREATE POLICY "quote_items_update" ON public.quote_items
FOR UPDATE TO authenticated
USING (
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
)
WITH CHECK (
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

-- DELETE: Active Staff Only
CREATE POLICY "quote_items_delete" ON public.quote_items
FOR DELETE TO authenticated
USING (
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

-- Secure invoice_items access with strict RLS
-- This migration enables RLS on invoice_items and adds policies that inherit
-- permissions from the parent invoice, respecting company_members and client ownership.

ALTER TABLE IF EXISTS "invoice_items" ENABLE ROW LEVEL SECURITY;

-- Remove any existing policies to avoid conflicts
DROP POLICY IF EXISTS "invoice_items_select_policy" ON "invoice_items";
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON "invoice_items";
DROP POLICY IF EXISTS "invoice_items_update_policy" ON "invoice_items";
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON "invoice_items";

-- Policy: SELECT
-- Users can see items if they can see the invoice.
-- Access is determined by:
-- 1. Being an active company member (Staff)
-- 2. Being the client assigned to the invoice (Portal)
CREATE POLICY "invoice_items_select_policy" ON "invoice_items"
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = invoice_items.invoice_id
    AND (
      -- Company Member Access (Staff)
      EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = inv.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
      )
      OR
      -- Client Access (Portal)
      EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = inv.client_id
        AND c.email = (auth.jwt() ->> 'email')
      )
    )
  )
);

-- Policy: INSERT
-- Only active company members can add items (Owner/Admin roles usually, checking generic active member for now to match invoice policy)
CREATE POLICY "invoice_items_insert_policy" ON "invoice_items"
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = invoice_items.invoice_id
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = inv.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin') -- Restrict write to staff with role
    )
  )
);

-- Policy: UPDATE
-- Only active company members can update items
CREATE POLICY "invoice_items_update_policy" ON "invoice_items"
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = invoice_items.invoice_id
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = inv.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
    )
  )
);

-- Policy: DELETE
-- Only active company members can delete items
CREATE POLICY "invoice_items_delete_policy" ON "invoice_items"
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = invoice_items.invoice_id
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = inv.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
    )
  )
);

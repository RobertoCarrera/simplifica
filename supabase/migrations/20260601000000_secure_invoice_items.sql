-- Secure invoice_items with RLS
-- This migration enables RLS on invoice_items and adds strict policies
-- checking the parent invoice's company_id against company_members.

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Remove potential existing policies to ensure clean state
DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_write_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

-- 1. SELECT Policy: Staff (active) and Clients (own invoices)
CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    LEFT JOIN public.company_members cm ON cm.company_id = i.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
    WHERE i.id = invoice_items.invoice_id
    AND (
      cm.id IS NOT NULL -- User is active staff member
      OR
      -- User is the client associated with the invoice (via email match on auth.jwt)
      i.client_id IN (
        SELECT id FROM public.clients
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  )
);

-- 2. WRITE Policies (INSERT, UPDATE, DELETE): Only Staff (Active members)
-- We rely on company_members status='active'. This allows Owner, Admin, and Employee.

CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id -- On INSERT, this checks the NEW row's invoice_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id -- Existing row
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id -- New row state
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
  )
);

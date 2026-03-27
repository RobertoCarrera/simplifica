-- 20260401000000_fix_items_rls.sql

-- SECURITY FIX: Enable RLS on child tables (invoice_items, quote_items)
-- Reason: These tables were identified as lacking RLS, allowing potential data leakage.
-- Strategy:
-- 1. Staff Members get FULL ACCESS (SELECT, INSERT, UPDATE, DELETE) to their company's items.
-- 2. Clients get READ ONLY ACCESS (SELECT) to items on their invoices/quotes.

-- 1. Secure invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_access" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_staff_full" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_client_select" ON public.invoice_items;

-- Policy 1: Staff Full Access
CREATE POLICY "invoice_items_staff_full" ON public.invoice_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE i.id = invoice_items.invoice_id
      AND u.auth_user_id = auth.uid()
      AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE i.id = invoice_items.invoice_id
      AND u.auth_user_id = auth.uid()
      AND cm.status = 'active'
  )
);

-- Policy 2: Client Read Access
CREATE POLICY "invoice_items_client_select" ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.clients c ON c.id = i.client_id
    WHERE i.id = invoice_items.invoice_id
      AND c.auth_user_id = auth.uid()
  )
);

-- 2. Secure quote_items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_access" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_staff_full" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_client_select" ON public.quote_items;

-- Policy 1: Staff Full Access
CREATE POLICY "quote_items_staff_full" ON public.quote_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE q.id = quote_items.quote_id
      AND u.auth_user_id = auth.uid()
      AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE q.id = quote_items.quote_id
      AND u.auth_user_id = auth.uid()
      AND cm.status = 'active'
  )
);

-- Policy 2: Client Read Access
CREATE POLICY "quote_items_client_select" ON public.quote_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.clients c ON c.id = q.client_id
    WHERE q.id = quote_items.quote_id
      AND c.auth_user_id = auth.uid()
  )
);

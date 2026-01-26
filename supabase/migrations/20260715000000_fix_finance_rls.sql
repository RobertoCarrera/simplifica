-- Migration: Fix Finance RLS Policies (Invoices, Quotes, Items)
-- Date: 2026-07-15 00:00:00
-- Description:
-- 1. Fixes SELECT/DELETE policies on 'invoices' which were using incorrect user ID mapping (auth.uid vs public.users.id).
-- 2. Fixes ALL policies on 'quotes' for the same reason.
-- 3. Enables and configures RLS for 'invoice_items' and 'quote_items' (previously unprotected or implicitly protected).

-- Helper for user mapping to avoid repeated subqueries
-- (We rely on standard SQL logic here, repeating the subquery is efficient enough for PG optimizer)

-- =====================================================================================
-- 1. INVOICES (Fix SELECT and DELETE)
-- INSERT and UPDATE were already fixed in 20260129160000_finance_security_logic.sql
-- =====================================================================================

DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_policy" ON public.invoices;
-- Also drop older names just in case
DROP POLICY IF EXISTS "invoices_select_company" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_company" ON public.invoices;

CREATE POLICY "invoices_select_policy_v2" ON public.invoices
FOR SELECT TO authenticated
USING (
  -- Company Members
  (EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = invoices.company_id
      AND cm.status = 'active'
  ))
  -- OR Client Portal (if user is the client)
  OR
  (client_id IN (
    SELECT id FROM public.clients
    WHERE email = (select auth.jwt() ->> 'email')
  ))
);

CREATE POLICY "invoices_delete_policy_v2" ON public.invoices
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = invoices.company_id
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);

-- =====================================================================================
-- 2. QUOTES (Fix ALL Policies)
-- =====================================================================================

DROP POLICY IF EXISTS "quotes_select_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_select_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy_new" ON public.quotes;

CREATE POLICY "quotes_select_policy_v2" ON public.quotes
FOR SELECT TO authenticated
USING (
  (EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = quotes.company_id
      AND cm.status = 'active'
  ))
  OR
  (client_id IN (
    SELECT id FROM public.clients
    WHERE email = (select auth.jwt() ->> 'email')
  ))
);

CREATE POLICY "quotes_insert_policy_v2" ON public.quotes
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = quotes.company_id
      AND cm.status = 'active'
  )
);

CREATE POLICY "quotes_update_policy_v2" ON public.quotes
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = quotes.company_id
      AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = quotes.company_id
      AND cm.status = 'active'
  )
);

CREATE POLICY "quotes_delete_policy_v2" ON public.quotes
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = quotes.company_id
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);

-- =====================================================================================
-- 3. INVOICE ITEMS & QUOTE ITEMS (Enable RLS & Add Policies)
-- =====================================================================================

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- Invoice Items: Access via Parent Invoice
DROP POLICY IF EXISTS "invoice_items_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_policy" ON public.invoice_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.clients c ON i.client_id = c.id
    WHERE i.id = invoice_items.invoice_id
      AND c.email = (select auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      -- Clients generally don't edit items directly via API, usually handled by RPC or staff
      -- Adding strict check: Only staff can insert/update items via direct API
  )
);

-- Quote Items: Access via Parent Quote
DROP POLICY IF EXISTS "quote_items_policy" ON public.quote_items;
CREATE POLICY "quote_items_policy" ON public.quote_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.clients c ON q.client_id = c.id
    WHERE q.id = quote_items.quote_id
      AND c.email = (select auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
  )
);

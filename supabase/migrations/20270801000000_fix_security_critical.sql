-- Migration: Fix Critical RLS Security Issues (Regression Patch)
-- Date: 2027-08-01
-- Description: Fixes company_members RLS UUID mismatch and secures child tables (invoice_items, quote_items).

-- 1. FIX company_members RLS
-- The issue was comparing auth.uid() (auth.users.id) directly with company_members.user_id (public.users.id).
-- We need to bridge via public.users.auth_user_id.

DROP POLICY IF EXISTS "company_members_select_policy" ON public.company_members;
DROP POLICY IF EXISTS "company_members_view_self" ON public.company_members;
DROP POLICY IF EXISTS "company_members_view_teammates" ON public.company_members;

CREATE POLICY "company_members_view_self" ON public.company_members
FOR SELECT USING (
  user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
);

CREATE POLICY "company_members_view_teammates" ON public.company_members
FOR SELECT USING (
  company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND status = 'active'
  )
);

-- 2. SECURE invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Drop potential existing bad policies
DROP POLICY IF EXISTS "invoice_items_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_modify" ON public.invoice_items;

CREATE POLICY "invoice_items_policy" ON public.invoice_items
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

-- 3. SECURE quote_items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_select" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_modify" ON public.quote_items;

CREATE POLICY "quote_items_policy" ON public.quote_items
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active'
  )
);

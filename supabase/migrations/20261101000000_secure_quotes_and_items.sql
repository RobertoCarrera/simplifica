-- Fix Quotes RLS (UUID Mismatch) and Secure Child Items

-- 1. QUOTES (Fix UUID Mismatch)
-- Drop potentially broken policies from 20260107
DROP POLICY IF EXISTS "quotes_select_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy_new" ON public.quotes;

-- Re-create with correct auth.uid() -> public.users.id mapping
CREATE POLICY "quotes_select_policy_secure" ON public.quotes
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = quotes.company_id
      AND cm.status = 'active'
  )
);

CREATE POLICY "quotes_insert_policy_secure" ON public.quotes
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = quotes.company_id
      AND cm.status = 'active'
  )
);

CREATE POLICY "quotes_update_policy_secure" ON public.quotes
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = quotes.company_id
      AND cm.status = 'active'
  )
);

CREATE POLICY "quotes_delete_policy_secure" ON public.quotes
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = quotes.company_id
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);

-- 2. INVOICE ITEMS (Child Table Security)
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_isolation" ON public.invoice_items;

CREATE POLICY "invoice_items_isolation" ON public.invoice_items
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

-- 3. QUOTE ITEMS (Child Table Security)
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_isolation" ON public.quote_items;

CREATE POLICY "quote_items_isolation" ON public.quote_items
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

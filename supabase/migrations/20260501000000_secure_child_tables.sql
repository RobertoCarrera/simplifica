-- Migration: Secure Child Tables and Sensitive Configuration
-- Objective: Enable RLS and enforce strict policies on tables that were previously relying on parent context or unchecked.

-- 1. INVOICE ITEMS
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

-- SELECT: Inherit access from parent Invoice (Users who can see the invoice can see items)
CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
  )
);

-- WRITE (Insert/Update/Delete): Strict check for Company Members only (No Clients)
CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);


-- 2. QUOTE ITEMS
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;

-- SELECT: Inherit access from parent Quote
CREATE POLICY "quote_items_select_policy" ON public.quote_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
  )
);

-- WRITE: Strict check for Company Members only
CREATE POLICY "quote_items_insert_policy" ON public.quote_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "quote_items_update_policy" ON public.quote_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "quote_items_delete_policy" ON public.quote_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);


-- 3. PAYMENT INTEGRATIONS (Sensitive)
ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_integrations_select_policy" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_write_policy" ON public.payment_integrations;

-- Read/Write restricted to Owner/Admin
CREATE POLICY "payment_integrations_select_policy" ON public.payment_integrations
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
    AND cm.company_id = payment_integrations.company_id
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "payment_integrations_write_policy" ON public.payment_integrations
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
    AND cm.company_id = payment_integrations.company_id
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);


-- 4. VERIFACTU SETTINGS (Sensitive)
ALTER TABLE public.verifactu_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_write_policy" ON public.verifactu_settings;

-- Read/Write restricted to Owner/Admin
CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
    AND cm.company_id = verifactu_settings.company_id
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "verifactu_settings_write_policy" ON public.verifactu_settings
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
    AND cm.company_id = verifactu_settings.company_id
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin')
  )
);

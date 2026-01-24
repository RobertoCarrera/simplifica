-- Migration: Secure Child Tables and Fix Cross-Tenant Policies
-- Date: 2026-05-01 00:00:00

-- 1. Invoice Items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

-- Select: Inherit visibility from parent (allows Clients to see items if they can see invoice)
CREATE POLICY "invoice_items_select_policy" ON public.invoice_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.invoices WHERE id = invoice_items.invoice_id)
);

-- Write: Restrict to active Company Members (Owner/Admin/Member)
-- Excludes Clients who might have view access but not edit access
CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    JOIN public.users u ON cm.user_id = u.id
    WHERE i.id = invoice_items.invoice_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin', 'member')
  )
);

CREATE POLICY "invoice_items_update_policy" ON public.invoice_items FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    JOIN public.users u ON cm.user_id = u.id
    WHERE i.id = invoice_items.invoice_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin', 'member')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    JOIN public.users u ON cm.user_id = u.id
    WHERE i.id = invoice_items.invoice_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin', 'member')
  )
);

CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON i.company_id = cm.company_id
    JOIN public.users u ON cm.user_id = u.id
    WHERE i.id = invoice_items.invoice_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin', 'member')
  )
);

-- 2. Quote Items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;

-- Select: Inherit visibility
CREATE POLICY "quote_items_select_policy" ON public.quote_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.quotes WHERE id = quote_items.quote_id)
);

-- Write: Restrict to active Company Members
CREATE POLICY "quote_items_insert_policy" ON public.quote_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    JOIN public.users u ON cm.user_id = u.id
    WHERE q.id = quote_items.quote_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin', 'member')
  )
);

CREATE POLICY "quote_items_update_policy" ON public.quote_items FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    JOIN public.users u ON cm.user_id = u.id
    WHERE q.id = quote_items.quote_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin', 'member')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    JOIN public.users u ON cm.user_id = u.id
    WHERE q.id = quote_items.quote_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin', 'member')
  )
);

CREATE POLICY "quote_items_delete_policy" ON public.quote_items FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON q.company_id = cm.company_id
    JOIN public.users u ON cm.user_id = u.id
    WHERE q.id = quote_items.quote_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin', 'member')
  )
);

-- 3. Payment Integrations (Fix Cross-Tenant Access)
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = payment_integrations.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = payment_integrations.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = payment_integrations.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = payment_integrations.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
);

-- 4. Verifactu Settings (Fix potential weak check on users.company_id)
DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_insert_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_delete_policy" ON public.verifactu_settings;

CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = verifactu_settings.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
);

CREATE POLICY "verifactu_settings_insert_policy" ON public.verifactu_settings FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = verifactu_settings.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
);

CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = verifactu_settings.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
);

CREATE POLICY "verifactu_settings_delete_policy" ON public.verifactu_settings FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = verifactu_settings.company_id
    AND cm.role = 'owner'
    AND cm.status = 'active'
  )
);

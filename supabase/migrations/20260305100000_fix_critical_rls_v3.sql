-- Migration: Fix Critical RLS Issues (Payment Integrations, Item Tags, Invoices/Quotes)
-- Date: 2026-03-05
-- Severity: Critical

-- 1. FIX PAYMENT INTEGRATIONS (Cross-Tenant Leak)
-- The previous policy checked for admin role but missed checking if the user belongs to the SAME company.

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id -- FIX: Added company match
    AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id -- FIX: Added company match
    AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id -- FIX: Added company match
    AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id -- FIX: Added company match
    AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);


-- 2. FIX INVOICES & QUOTES (Broken Access / ID Mismatch)
-- Previous policies compared 'cm.user_id = auth.uid()'.
-- cm.user_id is public.users.id (UUID), auth.uid() is auth.users.id (UUID). They are distinct.
-- We must resolve auth.uid() -> public.users.id first.

-- 2a. Invoices
DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_policy" ON public.invoices;

CREATE POLICY "invoices_select_policy" ON public.invoices FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) -- FIX: Resolve ID
        AND cm.company_id = invoices.company_id
        AND cm.status = 'active'
    )
    AND deleted_at IS NULL
);

CREATE POLICY "invoices_insert_policy" ON public.invoices FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) -- FIX: Resolve ID
        AND cm.company_id = invoices.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin')
    )
);

CREATE POLICY "invoices_update_policy" ON public.invoices FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) -- FIX: Resolve ID
        AND cm.company_id = invoices.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin')
    )
    AND deleted_at IS NULL
);

CREATE POLICY "invoices_delete_policy" ON public.invoices FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) -- FIX: Resolve ID
        AND cm.company_id = invoices.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin')
    )
);

-- 2b. Quotes
-- Robustly drop potential old policy names
DROP POLICY IF EXISTS "quotes_select_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_select_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy" ON public.quotes;


CREATE POLICY "quotes_select_policy" ON public.quotes FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) -- FIX: Resolve ID
        AND cm.company_id = quotes.company_id
        AND cm.status = 'active'
    )
);

CREATE POLICY "quotes_insert_policy" ON public.quotes FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) -- FIX: Resolve ID
        AND cm.company_id = quotes.company_id
        AND cm.status = 'active'
    )
);

CREATE POLICY "quotes_update_policy" ON public.quotes FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) -- FIX: Resolve ID
        AND cm.company_id = quotes.company_id
        AND cm.status = 'active'
    )
);

CREATE POLICY "quotes_delete_policy" ON public.quotes FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) -- FIX: Resolve ID
        AND cm.company_id = quotes.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin')
    )
);


-- 3. FIX ITEM_TAGS (Global Data Leak)
-- Currently relies on polymorphic 'record_id' and 'USING (true)'.
-- We will add 'company_id', backfill it, and enforce RLS.

-- 3.1 Add Column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_tags' AND column_name = 'company_id') THEN
        ALTER TABLE public.item_tags ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3.2 Backfill Data (Clients, Tickets, Services)
UPDATE public.item_tags
SET company_id = c.company_id
FROM public.clients c
WHERE item_tags.record_id = c.id
  AND item_tags.record_type = 'client'
  AND item_tags.company_id IS NULL;

UPDATE public.item_tags
SET company_id = t.company_id
FROM public.tickets t
WHERE item_tags.record_id = t.id
  AND item_tags.record_type = 'ticket'
  AND item_tags.company_id IS NULL;

UPDATE public.item_tags
SET company_id = s.company_id
FROM public.services s
WHERE item_tags.record_id = s.id
  AND item_tags.record_type = 'service'
  AND item_tags.company_id IS NULL;

-- Backfill Bookings just in case
UPDATE public.item_tags
SET company_id = b.company_id
FROM public.bookings b
WHERE item_tags.record_id = b.id
  AND item_tags.record_type = 'booking'
  AND item_tags.company_id IS NULL;

-- Note: We do NOT delete orphaned tags here to prevent data loss.
-- They will simply be effectively hidden by RLS policies below since company_id will be NULL.

-- 3.3 Create Index
CREATE INDEX IF NOT EXISTS "item_tags_company_id_idx" ON public.item_tags (company_id);

-- 3.4 Secure Policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- New Strict Policies
CREATE POLICY "item_tags_select_policy" ON public.item_tags FOR SELECT TO authenticated
USING (
    company_id IS NOT NULL AND -- Explicitly exclude orphans
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = item_tags.company_id
        AND cm.status = 'active'
    )
);

CREATE POLICY "item_tags_insert_policy" ON public.item_tags FOR INSERT TO authenticated
WITH CHECK (
    company_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = item_tags.company_id
        AND cm.status = 'active'
    )
);

CREATE POLICY "item_tags_delete_policy" ON public.item_tags FOR DELETE TO authenticated
USING (
    company_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = item_tags.company_id
        AND cm.status = 'active'
    )
);

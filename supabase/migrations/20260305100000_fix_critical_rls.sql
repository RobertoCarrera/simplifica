-- Fix Critical RLS Vulnerabilities in payment_integrations and item_tags

-- 1. FIX PAYMENT_INTEGRATIONS RLS
-- Previous policies leaked data across companies because they didn't check company_id.

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
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);


-- 2. FIX ITEM_TAGS RLS
-- Previous policies were "TO authenticated USING (true)", allowing global access.

-- Add company_id column
ALTER TABLE public.item_tags ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Create index for performance and RLS
CREATE INDEX IF NOT EXISTS idx_item_tags_company_id ON public.item_tags(company_id);

-- Backfill company_id from related records
-- Clients
UPDATE public.item_tags it
SET company_id = c.company_id
FROM public.clients c
WHERE it.record_id = c.id
  AND it.record_type = 'client'
  AND it.company_id IS NULL;

-- Tickets
UPDATE public.item_tags it
SET company_id = t.company_id
FROM public.tickets t
WHERE it.record_id = t.id
  AND it.record_type = 'ticket'
  AND it.company_id IS NULL;

-- Services (Dynamic check in case table name varies, though 'services' is expected)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'services') THEN
        EXECUTE 'UPDATE public.item_tags it SET company_id = s.company_id FROM public.services s WHERE it.record_id = s.id AND it.record_type = ''service'' AND it.company_id IS NULL';
    END IF;

    -- Also check professional_services just in case
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'professional_services') THEN
        EXECUTE 'UPDATE public.item_tags it SET company_id = s.company_id FROM public.professional_services s WHERE it.record_id = s.id AND it.record_type = ''service'' AND it.company_id IS NULL';
    END IF;
END $$;

-- Enforce NOT NULL. If orphaned tags exist (no company found), they will be deleted to ensure integrity.
-- Alternatively, we could default them, but deleting orphans is safer for security than leaving them accessible or null.
DELETE FROM public.item_tags WHERE company_id IS NULL;
ALTER TABLE public.item_tags ALTER COLUMN company_id SET NOT NULL;


-- Drop old insecure policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- Create new secure policies
CREATE POLICY "item_tags_select" ON public.item_tags FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
  )
);

CREATE POLICY "item_tags_insert" ON public.item_tags FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
  )
);

CREATE POLICY "item_tags_delete" ON public.item_tags FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
  )
);

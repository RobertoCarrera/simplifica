-- Fix Critical RLS Vulnerabilities in payment_integrations and item_tags

-- 1. FIX PAYMENT INTEGRATIONS RLS
-- Drop insecure policies (created in 20260111130000)
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Recreate with strict company_id check
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);


-- 2. FIX ITEM_TAGS RLS
-- Add company_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_tags' AND column_name = 'company_id') THEN
        ALTER TABLE public.item_tags ADD COLUMN company_id uuid REFERENCES public.companies(id);
    END IF;
END $$;

-- Backfill company_id based on record_type
-- Clients
UPDATE public.item_tags
SET company_id = c.company_id
FROM public.clients c
WHERE item_tags.record_type = 'client'
  AND item_tags.record_id = c.id
  AND item_tags.company_id IS NULL;

-- Tickets (assuming table name 'tickets')
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets') THEN
    UPDATE public.item_tags
    SET company_id = t.company_id
    FROM public.tickets t
    WHERE item_tags.record_type = 'ticket'
      AND item_tags.record_id = t.id
      AND item_tags.company_id IS NULL;
  END IF;
END $$;

-- Services (assuming table name 'services')
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'services') THEN
    UPDATE public.item_tags
    SET company_id = s.company_id
    FROM public.services s
    WHERE item_tags.record_type = 'service'
      AND item_tags.record_id = s.id
      AND item_tags.company_id IS NULL;
  END IF;
END $$;

-- Drop insecure policies on item_tags
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- Create secure policies
-- View: users can view tags for items in their company
CREATE POLICY "item_tags_select_policy" ON public.item_tags FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
        AND u.deleted_at IS NULL
    )
  )
);

-- Insert: users can add tags to items in their company
CREATE POLICY "item_tags_insert_policy" ON public.item_tags FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
        AND u.deleted_at IS NULL
    )
  )
);

-- Delete: users can delete tags from items in their company
CREATE POLICY "item_tags_delete_policy" ON public.item_tags FOR DELETE TO authenticated
USING (
  company_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
        AND u.deleted_at IS NULL
    )
  )
);

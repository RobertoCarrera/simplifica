-- Fix Critical Data Leaks
-- 1. Fix payment_integrations RLS (Cross-tenant leak)
-- 2. Fix item_tags RLS (Global access leak)

-- ==========================================
-- 1. Fix payment_integrations RLS
-- ==========================================

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
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
      AND u.company_id = payment_integrations.company_id
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
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
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
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

-- ==========================================
-- 2. Fix item_tags RLS
-- ==========================================

-- Add company_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'item_tags' AND column_name = 'company_id'
    ) THEN
        ALTER TABLE public.item_tags ADD COLUMN company_id uuid REFERENCES public.companies(id);
    END IF;
END $$;

-- Backfill company_id
-- We use a DO block to handle potential missing tables gracefully, although they should exist.
DO $$
BEGIN
    -- Backfill from clients
    UPDATE public.item_tags it
    SET company_id = c.id
    FROM public.clients c
    WHERE it.record_type = 'client'
      AND it.record_id = c.id
      AND it.company_id IS NULL;

    -- Backfill from tickets (if table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets') THEN
        UPDATE public.item_tags it
        SET company_id = t.company_id
        FROM public.tickets t
        WHERE it.record_type = 'ticket'
          AND it.record_id = t.id
          AND it.company_id IS NULL;
    END IF;

    -- Backfill from services (if table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'services') THEN
        UPDATE public.item_tags it
        SET company_id = s.company_id
        FROM public.services s
        WHERE it.record_type = 'service'
          AND it.record_id = s.id
          AND it.company_id IS NULL;
    END IF;

    -- Clean up orphans (optional, but good for security - if we can't determine company, it shouldn't exist or should be investigated)
    -- For now, we won't delete, but they won't be visible due to RLS.
END $$;

-- Drop insecure policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- Create secure policies
-- Read: Users can read tags of their company
CREATE POLICY "item_tags_select" ON public.item_tags FOR SELECT TO authenticated
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

-- Insert: Users can insert tags for their company
CREATE POLICY "item_tags_insert" ON public.item_tags FOR INSERT TO authenticated
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

-- Delete: Users can delete tags of their company
CREATE POLICY "item_tags_delete" ON public.item_tags FOR DELETE TO authenticated
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

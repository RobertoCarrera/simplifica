-- Fix Critical RLS Regression (2026-03-11)

-- 1. Fix Payment Integrations RLS
-- Drop insecure policies that allowed cross-tenant access
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Create secure policies enforcing company_id match
CREATE POLICY "payment_integrations_select_secure" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_insert_secure" ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_update_secure" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_delete_secure" ON public.payment_integrations
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

-- 2. Fix Item Tags RLS
-- Add company_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'item_tags'
        AND column_name = 'company_id'
    ) THEN
        ALTER TABLE public.item_tags ADD COLUMN company_id uuid REFERENCES public.companies(id);
    END IF;
END $$;

-- Backfill company_id from parent records
-- Clients
UPDATE public.item_tags it
SET company_id = c.company_id
FROM public.clients c
WHERE it.record_type = 'client' AND it.record_id = c.id
AND it.company_id IS NULL;

-- Tickets
UPDATE public.item_tags it
SET company_id = t.company_id
FROM public.tickets t
WHERE it.record_type = 'ticket' AND it.record_id = t.id
AND it.company_id IS NULL;

-- Services
UPDATE public.item_tags it
SET company_id = s.company_id
FROM public.services s
WHERE it.record_type = 'service' AND it.record_id = s.id
AND it.company_id IS NULL;

-- Bookings
UPDATE public.item_tags it
SET company_id = b.company_id
FROM public.bookings b
WHERE it.record_type = 'booking' AND it.record_id = b.id
AND it.company_id IS NULL;

-- Drop insecure policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- Create secure policies
CREATE POLICY "item_tags_select_secure" ON public.item_tags
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
  )
);

CREATE POLICY "item_tags_insert_secure" ON public.item_tags
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
  )
);

CREATE POLICY "item_tags_delete_secure" ON public.item_tags
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
  )
);

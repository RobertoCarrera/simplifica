-- Fix Critical RLS Security Issues
-- 1. Fix cross-tenant leak in payment_integrations
-- 2. Fix global access in item_tags

-- ==========================================
-- 1. FIX PAYMENT_INTEGRATIONS RLS
-- ==========================================

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Secure Select Policy
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO public
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

-- Secure Insert Policy
CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
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

-- Secure Update Policy
CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
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

-- Secure Delete Policy
CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
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
-- 2. FIX ITEM_TAGS SECURITY
-- ==========================================

-- Add company_id column if it doesn't exist
ALTER TABLE public.item_tags ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill company_id
DO $$
BEGIN
    -- Backfill from clients
    UPDATE public.item_tags it
    SET company_id = c.company_id
    FROM public.clients c
    WHERE it.record_type = 'client' AND it.record_id = c.id AND it.company_id IS NULL;

    -- Backfill from tickets
    UPDATE public.item_tags it
    SET company_id = t.company_id
    FROM public.tickets t
    WHERE it.record_type = 'ticket' AND it.record_id = t.id AND it.company_id IS NULL;

    -- Backfill from invoices
    UPDATE public.item_tags it
    SET company_id = i.company_id
    FROM public.invoices i
    WHERE it.record_type = 'invoice' AND it.record_id = i.id AND it.company_id IS NULL;

    -- Backfill from services
    UPDATE public.item_tags it
    SET company_id = s.company_id
    FROM public.services s
    WHERE it.record_type = 'service' AND it.record_id = s.id AND it.company_id IS NULL;

    -- Backfill from bookings (if exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bookings') THEN
         UPDATE public.item_tags it
         SET company_id = b.company_id
         FROM public.bookings b
         WHERE it.record_type = 'booking' AND it.record_id = b.id AND it.company_id IS NULL;
    END IF;
END $$;

-- Create function to auto-populate company_id
CREATE OR REPLACE FUNCTION public.populate_item_tags_company_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.record_type = 'client' THEN
    SELECT company_id INTO NEW.company_id FROM public.clients WHERE id = NEW.record_id;
  ELSIF NEW.record_type = 'ticket' THEN
    SELECT company_id INTO NEW.company_id FROM public.tickets WHERE id = NEW.record_id;
  ELSIF NEW.record_type = 'invoice' THEN
    SELECT company_id INTO NEW.company_id FROM public.invoices WHERE id = NEW.record_id;
  ELSIF NEW.record_type = 'service' THEN
    SELECT company_id INTO NEW.company_id FROM public.services WHERE id = NEW.record_id;
  ELSIF NEW.record_type = 'booking' THEN
    -- Check if table exists to avoid error during function creation if table missing?
    -- PL/pgSQL checks existence at planning time. Assuming bookings exists.
    -- If we want to be safe, we can use dynamic SQL, but it's slower.
    -- Given migration history says bookings exists, we proceed.
    BEGIN
        SELECT company_id INTO NEW.company_id FROM public.bookings WHERE id = NEW.record_id;
    EXCEPTION WHEN undefined_table THEN
        -- Ignore if table doesn't exist
        NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create Trigger
DROP TRIGGER IF EXISTS tr_populate_item_tags_company_id ON public.item_tags;
CREATE TRIGGER tr_populate_item_tags_company_id
BEFORE INSERT ON public.item_tags
FOR EACH ROW
EXECUTE FUNCTION public.populate_item_tags_company_id();

-- Create Index on company_id
CREATE INDEX IF NOT EXISTS idx_item_tags_company_id ON public.item_tags(company_id);

-- Update RLS Policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- Secure Select
CREATE POLICY "item_tags_select_policy" ON public.item_tags FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = item_tags.company_id
    AND u.deleted_at IS NULL
  )
);

-- Secure Insert
CREATE POLICY "item_tags_insert_policy" ON public.item_tags FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = item_tags.company_id
    AND u.deleted_at IS NULL
  )
);

-- Secure Delete
CREATE POLICY "item_tags_delete_policy" ON public.item_tags FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = item_tags.company_id
    AND u.deleted_at IS NULL
  )
);

-- Migration: Fix Critical RLS Security in payment_integrations and item_tags

-- 1. Fix payment_integrations RLS
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

-- 2. Harden item_tags
-- Add company_id column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'item_tags' AND column_name = 'company_id'
    ) THEN
        ALTER TABLE public.item_tags ADD COLUMN company_id uuid REFERENCES public.companies(id);
        CREATE INDEX IF NOT EXISTS item_tags_company_id_idx ON public.item_tags(company_id);
    END IF;
END $$;

-- Create trigger function to auto-populate company_id
CREATE OR REPLACE FUNCTION public.populate_item_tags_company_id()
RETURNS TRIGGER AS $$
DECLARE
    parent_company_id uuid;
BEGIN
    -- Only attempt if company_id is null
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Dynamic lookup based on record_type
    -- We use dynamic SQL to avoid hard dependencies on tables that might not exist in all environments
    BEGIN
        CASE NEW.record_type
            WHEN 'client' THEN
                EXECUTE 'SELECT company_id FROM public.clients WHERE id = $1' INTO parent_company_id USING NEW.record_id;
            WHEN 'ticket' THEN
                EXECUTE 'SELECT company_id FROM public.tickets WHERE id = $1' INTO parent_company_id USING NEW.record_id;
            WHEN 'service' THEN
                EXECUTE 'SELECT company_id FROM public.services WHERE id = $1' INTO parent_company_id USING NEW.record_id;
            WHEN 'invoice' THEN
                EXECUTE 'SELECT company_id FROM public.invoices WHERE id = $1' INTO parent_company_id USING NEW.record_id;
            WHEN 'booking' THEN
                EXECUTE 'SELECT company_id FROM public.bookings WHERE id = $1' INTO parent_company_id USING NEW.record_id;
            ELSE
                -- Unknown type, cannot infer company_id.
                NULL;
        END CASE;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    NEW.company_id := parent_company_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger
DROP TRIGGER IF EXISTS tr_populate_item_tags_company_id ON public.item_tags;
CREATE TRIGGER tr_populate_item_tags_company_id
BEFORE INSERT ON public.item_tags
FOR EACH ROW
EXECUTE FUNCTION public.populate_item_tags_company_id();

-- Backfill existing records (Best Effort)
DO $$
DECLARE
    r record;
BEGIN
    -- Update clients
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
        UPDATE public.item_tags it SET company_id = c.company_id
        FROM public.clients c
        WHERE it.record_type = 'client' AND it.record_id = c.id AND it.company_id IS NULL;
    END IF;

    -- Update tickets
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets') THEN
        UPDATE public.item_tags it SET company_id = t.company_id
        FROM public.tickets t
        WHERE it.record_type = 'ticket' AND it.record_id = t.id AND it.company_id IS NULL;
    END IF;

    -- Update services
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'services') THEN
        UPDATE public.item_tags it SET company_id = s.company_id
        FROM public.services s
        WHERE it.record_type = 'service' AND it.record_id = s.id AND it.company_id IS NULL;
    END IF;

    -- Update invoices
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
        UPDATE public.item_tags it SET company_id = i.company_id
        FROM public.invoices i
        WHERE it.record_type = 'invoice' AND it.record_id = i.id AND it.company_id IS NULL;
    END IF;
END $$;

-- Update RLS policies for item_tags
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- New secure policies
CREATE POLICY "item_tags_select" ON public.item_tags FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "item_tags_insert" ON public.item_tags FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "item_tags_delete" ON public.item_tags FOR DELETE TO authenticated
USING (
  company_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
  )
);

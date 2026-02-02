-- Fix Critical RLS Issues

-- =================================================================
-- 1. Payment Integrations: Fix Cross-Tenant Access
-- =================================================================

-- Drop existing insecure policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Create strict policies ensuring company_id match
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
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
  )
);

-- =================================================================
-- 2. Item Tags: Fix Global Data Leak
-- =================================================================

-- Add company_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'item_tags' AND column_name = 'company_id'
    ) THEN
        ALTER TABLE "public"."item_tags" ADD COLUMN "company_id" uuid REFERENCES "public"."companies"("id") ON DELETE CASCADE;
        CREATE INDEX "item_tags_company_id_idx" ON "public"."item_tags" ("company_id");
    END IF;
END $$;

-- Function to auto-populate company_id
CREATE OR REPLACE FUNCTION populate_item_tags_company_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If company_id is already provided, respect it
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Lookup company_id based on record_type
    IF NEW.record_type = 'client' THEN
        SELECT company_id INTO NEW.company_id FROM public.clients WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'ticket' THEN
        SELECT company_id INTO NEW.company_id FROM public.tickets WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'service' THEN
        -- Check if services table exists dynamically to avoid errors in strict mode,
        -- but since we are in plpgsql, simpler to just try.
        -- Assuming 'services' exists as per audit.
        BEGIN
            SELECT company_id INTO NEW.company_id FROM public.services WHERE id = NEW.record_id;
        EXCEPTION WHEN OTHERS THEN
            -- Ignore if table doesn't exist
            NULL;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
DROP TRIGGER IF EXISTS "tr_populate_item_tags_company_id" ON "public"."item_tags";
CREATE TRIGGER "tr_populate_item_tags_company_id"
BEFORE INSERT ON "public"."item_tags"
FOR EACH ROW EXECUTE FUNCTION populate_item_tags_company_id();

-- Backfill existing data
UPDATE "public"."item_tags" it
SET company_id = c.company_id
FROM "public"."clients" c
WHERE it.record_type = 'client' AND it.record_id = c.id AND it.company_id IS NULL;

UPDATE "public"."item_tags" it
SET company_id = t.company_id
FROM "public"."tickets" t
WHERE it.record_type = 'ticket' AND it.record_id = t.id AND it.company_id IS NULL;

-- Only run for services if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'services') THEN
        UPDATE "public"."item_tags" it
        SET company_id = s.company_id
        FROM "public"."services" s
        WHERE it.record_type = 'service' AND it.record_id = s.id AND it.company_id IS NULL;
    END IF;
END $$;

-- Drop insecure policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON "public"."item_tags";
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON "public"."item_tags";
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON "public"."item_tags";

-- Create strict policies
CREATE POLICY "item_tags_select" ON "public"."item_tags" FOR SELECT TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
  )
);

CREATE POLICY "item_tags_insert" ON "public"."item_tags" FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (
    SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
  )
);

CREATE POLICY "item_tags_delete" ON "public"."item_tags" FOR DELETE TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
  )
);

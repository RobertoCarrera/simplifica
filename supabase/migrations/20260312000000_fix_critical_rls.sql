-- Fix Critical RLS Vulnerabilities
-- 1. payment_integrations (Cross-tenant leak)
-- 2. item_tags (Global access, missing company_id)

-- ==============================================================================
-- 1. FIX PAYMENT INTEGRATIONS
-- ==============================================================================

-- Drop insecure policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Recreate policies with strict company_id check
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
  )
);


-- ==============================================================================
-- 2. FIX ITEM_TAGS
-- ==============================================================================

-- Add company_id column if it doesn't exist
ALTER TABLE public.item_tags ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Backfill existing data
DO $$
BEGIN
    -- Clients
    UPDATE public.item_tags
    SET company_id = (SELECT company_id FROM public.clients WHERE id = item_tags.record_id)
    WHERE record_type = 'client' AND company_id IS NULL;

    -- Services
    UPDATE public.item_tags
    SET company_id = (SELECT company_id FROM public.services WHERE id = item_tags.record_id)
    WHERE record_type = 'service' AND company_id IS NULL;

    -- Tickets (Attempt backfill if table exists)
    BEGIN
        UPDATE public.item_tags
        SET company_id = (SELECT company_id FROM public.tickets WHERE id = item_tags.record_id)
        WHERE record_type = 'ticket' AND company_id IS NULL;
    EXCEPTION WHEN undefined_table THEN
        -- Ignore if tickets table doesn't exist yet
        RAISE NOTICE 'Tickets table not found, skipping backfill for tickets';
    END;
END $$;

-- Create trigger function to auto-populate company_id
CREATE OR REPLACE FUNCTION populate_item_tags_company_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If company_id is already provided, keep it (allows explicit override if needed)
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Infer company_id from parent record based on record_type
    IF NEW.record_type = 'client' THEN
        SELECT company_id INTO NEW.company_id FROM public.clients WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'ticket' THEN
        SELECT company_id INTO NEW.company_id FROM public.tickets WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'service' THEN
        SELECT company_id INTO NEW.company_id FROM public.services WHERE id = NEW.record_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_populate_item_tags_company_id ON public.item_tags;
CREATE TRIGGER trg_populate_item_tags_company_id
BEFORE INSERT ON public.item_tags
FOR EACH ROW
EXECUTE FUNCTION populate_item_tags_company_id();

-- Drop insecure policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- Enable RLS (ensure it is on)
ALTER TABLE public.item_tags ENABLE ROW LEVEL SECURITY;

-- Create secure policies
-- Read: User must be a member of the company that owns the tag assignment
CREATE POLICY "item_tags_select_policy" ON public.item_tags
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = item_tags.company_id
          AND cm.status = 'active'
    )
);

-- Insert: User must be a member of the company (company_id populated by trigger)
CREATE POLICY "item_tags_insert_policy" ON public.item_tags
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = item_tags.company_id
          AND cm.status = 'active'
    )
);

-- Delete: User must be a member of the company
CREATE POLICY "item_tags_delete_policy" ON public.item_tags
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = item_tags.company_id
          AND cm.status = 'active'
    )
);

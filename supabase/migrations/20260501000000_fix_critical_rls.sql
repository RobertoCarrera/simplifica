-- Fix Critical RLS Issues in Payment Integrations and Item Tags

-- 1. FIX PAYMENT INTEGRATIONS RLS
-- =================================

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


-- 2. FIX ITEM TAGS GLOBAL ACCESS
-- =================================

-- Add company_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_tags' AND column_name = 'company_id') THEN
        ALTER TABLE public.item_tags ADD COLUMN company_id UUID REFERENCES public.companies(id);
        CREATE INDEX IF NOT EXISTS item_tags_company_id_idx ON public.item_tags(company_id);
    END IF;
END $$;

-- Create function to populate company_id dynamically
CREATE OR REPLACE FUNCTION public.populate_item_tags_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_company_id UUID;
    v_table_name TEXT;
BEGIN
    -- Determine table name based on record_type
    IF NEW.record_type = 'client' THEN v_table_name := 'clients';
    ELSIF NEW.record_type = 'ticket' THEN v_table_name := 'tickets';
    ELSIF NEW.record_type = 'service' THEN v_table_name := 'services';
    ELSIF NEW.record_type = 'invoice' THEN v_table_name := 'invoices';
    ELSIF NEW.record_type = 'booking' THEN v_table_name := 'bookings';
    ELSE
        RETURN NEW; -- Unknown type, skip
    END IF;

    -- Dynamic query to get company_id from the parent record
    -- We use quote_ident to prevent SQL injection on table name (though we control it above)
    BEGIN
        EXECUTE format('SELECT company_id FROM public.%I WHERE id = $1', v_table_name)
        INTO v_company_id
        USING NEW.record_id;

        IF v_company_id IS NOT NULL THEN
            NEW.company_id := v_company_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- If table doesn't exist or other error, just ignore
        NULL;
    END;

    RETURN NEW;
END;
$$;

-- Create Trigger
DROP TRIGGER IF EXISTS tr_populate_item_tags_company_id ON public.item_tags;
CREATE TRIGGER tr_populate_item_tags_company_id
BEFORE INSERT OR UPDATE ON public.item_tags
FOR EACH ROW
WHEN (NEW.company_id IS NULL)
EXECUTE FUNCTION public.populate_item_tags_company_id();

-- Backfill existing data
-- We update the table to trigger the function for rows where company_id is null
UPDATE public.item_tags SET id = id WHERE company_id IS NULL;

-- Fix RLS Policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- New Policies with Company Check
CREATE POLICY "item_tags_select" ON public.item_tags FOR SELECT TO authenticated
USING (
  company_id IS NULL OR -- Allow if null (legacy) OR check match
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
  )
);

CREATE POLICY "item_tags_insert" ON public.item_tags FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
  )
);

CREATE POLICY "item_tags_delete" ON public.item_tags FOR DELETE TO authenticated
USING (
  company_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
  )
);

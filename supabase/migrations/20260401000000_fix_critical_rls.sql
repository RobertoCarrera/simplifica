-- Migration: 20260401000000_fix_critical_rls.sql
-- Purpose: Fix critical RLS leaks in payment_integrations and item_tags
-- Severity: Critical

-- =============================================================================
-- 1. FIX PAYMENT_INTEGRATIONS RLS (Cross-Tenant Leak)
-- =============================================================================

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


-- =============================================================================
-- 2. FIX ITEM_TAGS RLS (Global Access)
-- =============================================================================

-- 2.1 Add company_id column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_tags' AND column_name = 'company_id') THEN
        ALTER TABLE "public"."item_tags" ADD COLUMN "company_id" uuid REFERENCES "public"."companies"("id");
        CREATE INDEX IF NOT EXISTS "item_tags_company_id_idx" ON "public"."item_tags" ("company_id");
    END IF;
END $$;

-- 2.2 Create Trigger Function to populate company_id safely
CREATE OR REPLACE FUNCTION public.populate_item_tags_company_id()
RETURNS TRIGGER AS $$
DECLARE
    found_company_id uuid;
    query text;
BEGIN
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Use dynamic SQL to avoid compile errors if tables are missing or schema changes
    BEGIN
        IF NEW.record_type = 'client' THEN
            EXECUTE 'SELECT company_id FROM public.clients WHERE id = $1' INTO found_company_id USING NEW.record_id;
        ELSIF NEW.record_type = 'ticket' THEN
             EXECUTE 'SELECT company_id FROM public.tickets WHERE id = $1' INTO found_company_id USING NEW.record_id;
        ELSIF NEW.record_type = 'service' THEN
             EXECUTE 'SELECT company_id FROM public.services WHERE id = $1' INTO found_company_id USING NEW.record_id;
        ELSIF NEW.record_type = 'invoice' THEN
             EXECUTE 'SELECT company_id FROM public.invoices WHERE id = $1' INTO found_company_id USING NEW.record_id;
        ELSIF NEW.record_type = 'booking' THEN
             EXECUTE 'SELECT company_id FROM public.bookings WHERE id = $1' INTO found_company_id USING NEW.record_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- If table doesn't exist, we can't find company_id.
        -- Log warning or ignore. For now, leave as NULL (RLS will block access if NULL).
        RAISE WARNING 'Could not populate company_id for item_tags record_type %: %', NEW.record_type, SQLERRM;
    END;

    NEW.company_id := found_company_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2.3 Attach Trigger
DROP TRIGGER IF EXISTS tr_populate_item_tags_company_id ON public.item_tags;
CREATE TRIGGER tr_populate_item_tags_company_id
BEFORE INSERT ON public.item_tags
FOR EACH ROW
EXECUTE FUNCTION public.populate_item_tags_company_id();

-- 2.4 Backfill existing data
DO $$
DECLARE
    t text;
BEGIN
    -- List of known tables mapped to record_types
    FOR t IN SELECT unnest(ARRAY['clients', 'tickets', 'services', 'invoices', 'bookings'])
    LOOP
        -- Check if table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            -- Determine record_type (singular)
            DECLARE
                rtype text := CASE
                    WHEN t = 'clients' THEN 'client'
                    WHEN t = 'tickets' THEN 'ticket'
                    WHEN t = 'services' THEN 'service'
                    WHEN t = 'invoices' THEN 'invoice'
                    WHEN t = 'bookings' THEN 'booking'
                END;
            BEGIN
                EXECUTE format('
                    UPDATE public.item_tags it
                    SET company_id = src.company_id
                    FROM public.%I src
                    WHERE it.record_id = src.id
                    AND it.record_type = %L
                    AND it.company_id IS NULL
                ', t, rtype);
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Backfill failed for %: %', t, SQLERRM;
            END;
        END IF;
    END LOOP;
END $$;

-- 2.5 Apply Strict RLS
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- View: Owners/Admins/Employees can see tags for their company
CREATE POLICY "item_tags_select" ON public.item_tags FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
      AND u.active = true
  )
);

-- Insert: Users can insert tags for their company
CREATE POLICY "item_tags_insert" ON public.item_tags FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
      AND u.active = true
  )
);

-- Delete: Users can delete tags for their company
CREATE POLICY "item_tags_delete" ON public.item_tags FOR DELETE TO authenticated
USING (
  company_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
      AND u.active = true
  )
);

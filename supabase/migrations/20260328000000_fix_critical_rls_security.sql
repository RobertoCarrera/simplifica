-- Security Hardening: Fix Critical RLS Leaks in payment_integrations and item_tags

-- 1. FIX PAYMENT INTEGRATIONS
-- Problem: Policies allowed admins to access ANY company's integrations.
-- Fix: Enforce company_id matching.

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- New Policies for payment_integrations
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


-- 2. FIX ITEM_TAGS
-- Problem: Global access to all tags. No company_id column.
-- Fix: Add company_id, backfill, enable RLS.

-- A. Add column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_tags' AND column_name = 'company_id') THEN
        ALTER TABLE public.item_tags ADD COLUMN company_id UUID REFERENCES public.companies(id);
    END IF;
END $$;

-- B. Backfill company_id
-- Clients
UPDATE public.item_tags it
SET company_id = c.company_id
FROM public.clients c
WHERE it.record_type = 'client' AND it.record_id = c.id AND it.company_id IS NULL;

-- Tickets
UPDATE public.item_tags it
SET company_id = t.company_id
FROM public.tickets t
WHERE it.record_type = 'ticket' AND it.record_id = t.id AND it.company_id IS NULL;

-- Invoices
UPDATE public.item_tags it
SET company_id = inv.company_id
FROM public.invoices inv
WHERE it.record_type = 'invoice' AND it.record_id = inv.id AND it.company_id IS NULL;

-- Services (Dynamic check)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'services') THEN
        UPDATE public.item_tags it
        SET company_id = s.company_id
        FROM public.services s
        WHERE it.record_type = 'service' AND it.record_id = s.id AND it.company_id IS NULL;
    END IF;
END $$;

-- Booking Types (Alternative for services)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_types') THEN
        UPDATE public.item_tags it
        SET company_id = bt.company_id
        FROM public.booking_types bt
        WHERE (it.record_type = 'service' OR it.record_type = 'booking_type') AND it.record_id = bt.id AND it.company_id IS NULL;
    END IF;
END $$;

-- Bookings
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookings') THEN
        UPDATE public.item_tags it
        SET company_id = b.company_id
        FROM public.bookings b
        WHERE (it.record_type = 'booking' OR it.record_type = 'bookings') AND it.record_id = b.id AND it.company_id IS NULL;
    END IF;
END $$;

-- Safe deletion of orphans: Backup first
CREATE TABLE IF NOT EXISTS public.item_tags_orphans_20260328 AS
SELECT * FROM public.item_tags WHERE company_id IS NULL;

DELETE FROM public.item_tags WHERE company_id IS NULL;

-- C. Enforce NOT NULL
ALTER TABLE public.item_tags ALTER COLUMN company_id SET NOT NULL;

-- D. Create Trigger to maintain company_id
CREATE OR REPLACE FUNCTION public.populate_item_tags_company_id()
RETURNS TRIGGER AS $$
DECLARE
    found_company_id UUID;
BEGIN
  IF NEW.company_id IS NULL THEN
    IF NEW.record_type = 'client' THEN
      SELECT company_id INTO found_company_id FROM public.clients WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'ticket' THEN
      SELECT company_id INTO found_company_id FROM public.tickets WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'invoice' THEN
      SELECT company_id INTO found_company_id FROM public.invoices WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'service' THEN
        -- Dynamic SQL to handle missing table and avoid compilation errors
        BEGIN
            EXECUTE 'SELECT company_id FROM public.services WHERE id = $1' INTO found_company_id USING NEW.record_id;
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END;

        IF found_company_id IS NULL THEN
             BEGIN
                EXECUTE 'SELECT company_id FROM public.booking_types WHERE id = $1' INTO found_company_id USING NEW.record_id;
             EXCEPTION WHEN undefined_table THEN
                NULL;
             END;
        END IF;
    ELSIF NEW.record_type = 'booking' OR NEW.record_type = 'bookings' THEN
       BEGIN
          EXECUTE 'SELECT company_id FROM public.bookings WHERE id = $1' INTO found_company_id USING NEW.record_id;
       EXCEPTION WHEN undefined_table THEN
          NULL;
       END;
    END IF;

    NEW.company_id := found_company_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_populate_item_tags_company_id ON public.item_tags;
CREATE TRIGGER trg_populate_item_tags_company_id
BEFORE INSERT ON public.item_tags
FOR EACH ROW
EXECUTE FUNCTION public.populate_item_tags_company_id();

-- E. Update Policies for item_tags
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

CREATE POLICY "item_tags_select" ON public.item_tags FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid() AND u.company_id = item_tags.company_id
  )
);

CREATE POLICY "item_tags_insert" ON public.item_tags FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid() AND u.company_id = item_tags.company_id
  )
);

CREATE POLICY "item_tags_delete" ON public.item_tags FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid() AND u.company_id = item_tags.company_id
  )
);

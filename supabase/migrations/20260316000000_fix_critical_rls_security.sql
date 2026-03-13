-- Fix Critical RLS Security Issues

-- 1. Fix payment_integrations Cross-Tenant Leak
-- The previous policies checked for admin role but missed the company_id check matching the user to the record.

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


-- 2. Fix item_tags Global Access
-- Add company_id and enforce RLS.

ALTER TABLE "public"."item_tags" ADD COLUMN IF NOT EXISTS "company_id" uuid REFERENCES "public"."companies"("id");

-- Backfill company_id for existing tags (Data Recovery)
-- We attempt to derive company_id from the related record.
-- Note: This runs before policies are enabled/enforced to ensure data isn't lost.

DO $$
BEGIN
    -- Update for clients
    UPDATE "public"."item_tags" it
    SET "company_id" = c.company_id
    FROM "public"."clients" c
    WHERE it.record_type = 'client' AND it.record_id = c.id AND it.company_id IS NULL;

    -- Update for tickets
    UPDATE "public"."item_tags" it
    SET "company_id" = t.company_id
    FROM "public"."tickets" t
    WHERE it.record_type = 'ticket' AND it.record_id = t.id AND it.company_id IS NULL;

    -- Update for services
    UPDATE "public"."item_tags" it
    SET "company_id" = s.company_id
    FROM "public"."services" s
    WHERE it.record_type = 'service' AND it.record_id = s.id AND it.company_id IS NULL;

    -- Update for invoices
    UPDATE "public"."item_tags" it
    SET "company_id" = i.company_id
    FROM "public"."invoices" i
    WHERE (it.record_type = 'invoice' OR it.record_type = 'invoices') AND it.record_id = i.id AND it.company_id IS NULL;

     -- Update for bookings
    UPDATE "public"."item_tags" it
    SET "company_id" = b.company_id
    FROM "public"."bookings" b
    WHERE (it.record_type = 'booking' OR it.record_type = 'bookings') AND it.record_id = b.id AND it.company_id IS NULL;

    -- For any remaining tags that couldn't be mapped (orphaned or unknown type),
    -- they will remain NULL and become invisible under the new policy.
END $$;


-- Function to auto-populate company_id from parent
CREATE OR REPLACE FUNCTION public.populate_item_tags_company_id()
RETURNS TRIGGER AS $$
DECLARE
    parent_company_id uuid;
BEGIN
    -- If company_id is already provided, respect it (unless null)
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.record_type = 'client' THEN
        SELECT company_id INTO parent_company_id FROM public.clients WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'ticket' THEN
        SELECT company_id INTO parent_company_id FROM public.tickets WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'service' THEN
        SELECT company_id INTO parent_company_id FROM public.services WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'invoice' OR NEW.record_type = 'invoices' THEN
        SELECT company_id INTO parent_company_id FROM public.invoices WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'booking' OR NEW.record_type = 'bookings' THEN
        SELECT company_id INTO parent_company_id FROM public.bookings WHERE id = NEW.record_id;
    END IF;

    IF parent_company_id IS NOT NULL THEN
        NEW.company_id := parent_company_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
DROP TRIGGER IF EXISTS tr_populate_item_tags_company_id ON public.item_tags;
CREATE TRIGGER tr_populate_item_tags_company_id
BEFORE INSERT ON public.item_tags
FOR EACH ROW
EXECUTE FUNCTION public.populate_item_tags_company_id();

-- Drop permissive policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON "public"."item_tags";
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON "public"."item_tags";
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON "public"."item_tags";

-- Create strict policies
-- Read: User must belong to the same company
CREATE POLICY "item_tags_select" ON "public"."item_tags" FOR SELECT TO authenticated
USING (
    company_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
    )
);

-- Insert: User must belong to the same company
CREATE POLICY "item_tags_insert" ON "public"."item_tags" FOR INSERT TO authenticated
WITH CHECK (
    company_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
    )
);

-- Delete: User must belong to the same company
CREATE POLICY "item_tags_delete" ON "public"."item_tags" FOR DELETE TO authenticated
USING (
    company_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
    )
);

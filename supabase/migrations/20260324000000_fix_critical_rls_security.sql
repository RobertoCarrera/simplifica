-- Fix Critical RLS Vulnerabilities in payment_integrations and item_tags

-- 1. FIX PAYMENT_INTEGRATIONS (Cross-Tenant Leak)
-- Drop insecure policies that don't check company_id
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


-- 2. FIX ITEM_TAGS (Global Access)
-- Add company_id column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_tags' AND column_name = 'company_id') THEN
        ALTER TABLE public.item_tags ADD COLUMN company_id uuid REFERENCES public.companies(id);
    END IF;
END $$;

-- Function to automatically populate company_id from parent record
CREATE OR REPLACE FUNCTION public.infer_item_tag_company_id() RETURNS TRIGGER AS $$
BEGIN
    -- If provided, trust it (RLS will verify it)
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Infer from parent record
    IF NEW.record_type = 'client' THEN
        SELECT company_id INTO NEW.company_id FROM public.clients WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'ticket' THEN
        SELECT company_id INTO NEW.company_id FROM public.tickets WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'service' THEN
        SELECT company_id INTO NEW.company_id FROM public.services WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'invoice' THEN
        SELECT company_id INTO NEW.company_id FROM public.invoices WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'booking' THEN
        SELECT company_id INTO NEW.company_id FROM public.bookings WHERE id = NEW.record_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run before insert
DROP TRIGGER IF EXISTS tr_populate_item_tag_company_id ON public.item_tags;
CREATE TRIGGER tr_populate_item_tag_company_id
BEFORE INSERT ON public.item_tags
FOR EACH ROW EXECUTE FUNCTION public.infer_item_tag_company_id();

-- Backfill existing data
DO $$
BEGIN
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

    -- Services
    UPDATE public.item_tags it
    SET company_id = s.company_id
    FROM public.services s
    WHERE it.record_type = 'service' AND it.record_id = s.id AND it.company_id IS NULL;

    -- Invoices
    UPDATE public.item_tags it
    SET company_id = i.company_id
    FROM public.invoices i
    WHERE it.record_type = 'invoice' AND it.record_id = i.id AND it.company_id IS NULL;

    -- Bookings
    UPDATE public.item_tags it
    SET company_id = b.company_id
    FROM public.bookings b
    WHERE it.record_type = 'booking' AND it.record_id = b.id AND it.company_id IS NULL;
END $$;

-- Drop insecure "true" policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- Create secure policies
CREATE POLICY "item_tags_select_secure" ON public.item_tags
FOR SELECT TO authenticated
USING (
    company_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
    )
);

CREATE POLICY "item_tags_insert_secure" ON public.item_tags
FOR INSERT TO authenticated
WITH CHECK (
    company_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
    )
);

CREATE POLICY "item_tags_delete_secure" ON public.item_tags
FOR DELETE TO authenticated
USING (
    company_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
    )
);

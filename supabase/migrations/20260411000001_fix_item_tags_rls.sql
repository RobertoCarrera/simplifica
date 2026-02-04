-- Fix Critical RLS Vulnerability in item_tags
-- 1. Add company_id column
-- 2. Backfill company_id from parent records
-- 3. Enforce RLS based on company_id

-- 1. Add column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'item_tags' AND column_name = 'company_id') THEN
        ALTER TABLE public.item_tags ADD COLUMN company_id uuid REFERENCES public.companies(id);
    END IF;
END $$;

-- 2. Backfill company_id using dynamic SQL to avoid errors if tables are missing
DO $$
BEGIN
    -- Backfill from clients
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
        UPDATE public.item_tags it
        SET company_id = c.company_id
        FROM public.clients c
        WHERE it.record_type = 'client' AND it.record_id = c.id
        AND it.company_id IS NULL;
    END IF;

    -- Backfill from tickets
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets') THEN
        EXECUTE 'UPDATE public.item_tags it SET company_id = t.company_id FROM public.tickets t WHERE it.record_type = ''ticket'' AND it.record_id = t.id AND it.company_id IS NULL';
    END IF;

    -- Backfill from services
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'services') THEN
        EXECUTE 'UPDATE public.item_tags it SET company_id = s.company_id FROM public.services s WHERE it.record_type = ''service'' AND it.record_id = s.id AND it.company_id IS NULL';
    END IF;

     -- Backfill from invoices
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
        EXECUTE 'UPDATE public.item_tags it SET company_id = i.company_id FROM public.invoices i WHERE it.record_type = ''invoice'' AND it.record_id = i.id AND it.company_id IS NULL';
    END IF;

     -- Backfill from bookings
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bookings') THEN
        EXECUTE 'UPDATE public.item_tags it SET company_id = b.company_id FROM public.bookings b WHERE it.record_type = ''booking'' AND it.record_id = b.id AND it.company_id IS NULL';
    END IF;
END $$;

-- 3. Clean up orphans (tags without valid parent company cannot be secured properly)
DELETE FROM public.item_tags WHERE company_id IS NULL;

-- 4. Make company_id NOT NULL
ALTER TABLE public.item_tags ALTER COLUMN company_id SET NOT NULL;

-- 5. Add Index for RLS performance
CREATE INDEX IF NOT EXISTS item_tags_company_id_idx ON public.item_tags(company_id);

-- 6. Update RLS Policies
-- Drop insecure "true" policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- Create secure policies
-- Read: Company members can see tags
CREATE POLICY "Company members can view tags" ON public.item_tags
FOR SELECT TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND status = 'active'
  )
);

-- Insert: Company members can add tags
CREATE POLICY "Company members can insert tags" ON public.item_tags
FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND status = 'active'
  )
);

-- Delete: Company members can delete tags
CREATE POLICY "Company members can delete tags" ON public.item_tags
FOR DELETE TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND status = 'active'
  )
);

-- 7. Trigger to automatically set company_id on insert if possible (optional but helpful for DX)
-- Not strictly necessary if frontend sends it, but ensures data integrity.
-- We'll rely on the client sending it or the backend enforcing the NOT NULL constraint.
-- However, for polymorphic tables, it's safer to have the DB look it up if missing?
-- No, 'company_id' is NOT NULL now, so INSERTs must provide it.
-- We will create a trigger to populate it if NULL, to prevent breaking existing code that might not send it.

CREATE OR REPLACE FUNCTION public.populate_item_tags_company_id()
RETURNS TRIGGER AS $$
DECLARE
    found_company_id uuid;
BEGIN
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Attempt lookup
    IF NEW.record_type = 'client' THEN
        SELECT company_id INTO found_company_id FROM public.clients WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'ticket' THEN
        EXECUTE 'SELECT company_id FROM public.tickets WHERE id = $1' INTO found_company_id USING NEW.record_id;
    ELSIF NEW.record_type = 'service' THEN
        EXECUTE 'SELECT company_id FROM public.services WHERE id = $1' INTO found_company_id USING NEW.record_id;
    ELSIF NEW.record_type = 'invoice' THEN
        EXECUTE 'SELECT company_id FROM public.invoices WHERE id = $1' INTO found_company_id USING NEW.record_id;
    ELSIF NEW.record_type = 'booking' THEN
        EXECUTE 'SELECT company_id FROM public.bookings WHERE id = $1' INTO found_company_id USING NEW.record_id;
    END IF;

    IF found_company_id IS NOT NULL THEN
        NEW.company_id := found_company_id;
    ELSE
        RAISE EXCEPTION 'Could not determine company_id for item_tag. Please provide it explicitly.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_populate_item_tags_company_id
BEFORE INSERT ON public.item_tags
FOR EACH ROW
EXECUTE FUNCTION public.populate_item_tags_company_id();

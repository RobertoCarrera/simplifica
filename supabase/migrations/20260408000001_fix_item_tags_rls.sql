-- Fix RLS on item_tags (Global Leak)
-- 1. Add company_id column
-- 2. Backfill company_id from parent records
-- 3. Add trigger to maintain company_id
-- 4. Enforce strict RLS

-- 1. Add company_id column
-- 1. Add company_id column and index
ALTER TABLE public.item_tags ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
CREATE INDEX IF NOT EXISTS "item_tags_company_id_idx" ON "public"."item_tags" ("company_id");

-- 2. Backfill function using dynamic SQL to be resilient against missing tables
CREATE OR REPLACE FUNCTION public.backfill_item_tags_company_id() RETURNS void AS $$
DECLARE
    target_table text;
    type_name text;
BEGIN
    -- Map record_type to table name
    -- We assume these tables have a 'company_id' column
    FOR type_name, target_table IN VALUES
        ('client', 'clients'),
        ('ticket', 'tickets'),
        ('service', 'services'),
        ('invoice', 'invoices'),
        ('booking', 'bookings')
    LOOP
        BEGIN
            EXECUTE format('
                UPDATE public.item_tags it
                SET company_id = t.company_id
                FROM public.%I t
                WHERE it.record_type = %L
                AND it.record_id = t.id
                AND it.company_id IS NULL', target_table, type_name);
        EXCEPTION WHEN undefined_table THEN
            RAISE NOTICE 'Table % does not exist, skipping backfill for type %', target_table, type_name;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 3. Execute backfill
SELECT public.backfill_item_tags_company_id();
DROP FUNCTION public.backfill_item_tags_company_id();

-- 4. Create Trigger Function to populate company_id on INSERT
CREATE OR REPLACE FUNCTION public.set_item_tags_company_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Attempt to find company_id based on record_type
    BEGIN
        IF NEW.record_type = 'client' THEN
            EXECUTE 'SELECT company_id FROM public.clients WHERE id = $1' INTO NEW.company_id USING NEW.record_id;
        ELSIF NEW.record_type = 'ticket' THEN
             EXECUTE 'SELECT company_id FROM public.tickets WHERE id = $1' INTO NEW.company_id USING NEW.record_id;
        ELSIF NEW.record_type = 'service' THEN
             EXECUTE 'SELECT company_id FROM public.services WHERE id = $1' INTO NEW.company_id USING NEW.record_id;
        ELSIF NEW.record_type = 'invoice' THEN
             EXECUTE 'SELECT company_id FROM public.invoices WHERE id = $1' INTO NEW.company_id USING NEW.record_id;
        ELSIF NEW.record_type = 'booking' THEN
             EXECUTE 'SELECT company_id FROM public.bookings WHERE id = $1' INTO NEW.company_id USING NEW.record_id;
        END IF;
    EXCEPTION WHEN undefined_table THEN
        -- If table doesn't exist, we can't find company_id.
        -- RLS will likely block access to this tag since company_id will be NULL.
        NULL;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Attach Trigger
DROP TRIGGER IF EXISTS trigger_set_item_tags_company_id ON public.item_tags;
CREATE TRIGGER trigger_set_item_tags_company_id
BEFORE INSERT ON public.item_tags
FOR EACH ROW
EXECUTE FUNCTION public.set_item_tags_company_id();

-- 6. Update RLS Policies to be strictly multi-tenant
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- Select: View tags if they belong to your company
CREATE POLICY "item_tags_select" ON public.item_tags FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
        AND u.deleted_at IS NULL
      )
  )
);

-- Insert: Create tags if they belong to your company
CREATE POLICY "item_tags_insert" ON public.item_tags FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
        AND u.deleted_at IS NULL
      )
  )
);

-- Delete: Delete tags if they belong to your company
CREATE POLICY "item_tags_delete" ON public.item_tags FOR DELETE TO authenticated
USING (
  company_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
        AND u.company_id = item_tags.company_id
        AND u.deleted_at IS NULL
      )
  )
);

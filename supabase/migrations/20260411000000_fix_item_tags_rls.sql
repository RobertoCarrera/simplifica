-- Fix Critical RLS Vulnerability in item_tags
-- 1. Add company_id column
-- 2. Backfill company_id from parent records
-- 3. Enforce strict RLS

-- 1. Add Column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'item_tags' AND column_name = 'company_id'
    ) THEN
        ALTER TABLE "public"."item_tags"
        ADD COLUMN "company_id" uuid REFERENCES "public"."companies"("id");

        CREATE INDEX "item_tags_company_id_idx" ON "public"."item_tags" ("company_id");
    END IF;
END $$;

-- 2. Trigger to auto-populate company_id on INSERT
CREATE OR REPLACE FUNCTION public.populate_item_tags_company_id()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.company_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Dynamic lookup based on record_type
    IF NEW.record_type = 'ticket' THEN
        SELECT company_id INTO NEW.company_id FROM public.tickets WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'client' THEN
        SELECT company_id INTO NEW.company_id FROM public.clients WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'service' THEN
        SELECT company_id INTO NEW.company_id FROM public.services WHERE id = NEW.record_id;
    ELSIF NEW.record_type = 'booking' THEN
        -- Safely check if bookings table exists to avoid migration failure
        BEGIN
            EXECUTE 'SELECT company_id FROM public.bookings WHERE id = $1'
            INTO NEW.company_id
            USING NEW.record_id;
        EXCEPTION WHEN OTHERS THEN
            -- Table might not exist yet or error
            NULL;
        END;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_populate_item_tags_company_id ON public.item_tags;
CREATE TRIGGER tr_populate_item_tags_company_id
    BEFORE INSERT ON public.item_tags
    FOR EACH ROW
    EXECUTE FUNCTION public.populate_item_tags_company_id();

-- 3. Backfill Data
-- We use dynamic SQL blocks to avoid errors if tables don't exist
DO $$
BEGIN
    -- Tickets
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tickets') THEN
        UPDATE public.item_tags it
        SET company_id = t.company_id
        FROM public.tickets t
        WHERE it.record_type = 'ticket' AND it.record_id = t.id AND it.company_id IS NULL;
    END IF;

    -- Clients
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'clients') THEN
        UPDATE public.item_tags it
        SET company_id = c.company_id
        FROM public.clients c
        WHERE it.record_type = 'client' AND it.record_id = c.id AND it.company_id IS NULL;
    END IF;

    -- Services
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'services') THEN
        UPDATE public.item_tags it
        SET company_id = s.company_id
        FROM public.services s
        WHERE it.record_type = 'service' AND it.record_id = s.id AND it.company_id IS NULL;
    END IF;
END $$;

-- 4. Fix RLS Policies
ALTER TABLE "public"."item_tags" ENABLE ROW LEVEL SECURITY;

-- Drop insecure policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON "public"."item_tags";
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON "public"."item_tags";
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON "public"."item_tags";

-- Add Secure Policies
-- View: Users can see tags if they belong to the same company
CREATE POLICY "item_tags_select_policy" ON "public"."item_tags"
    FOR SELECT
    TO authenticated
    USING (
        company_id IN (
            SELECT company_id
            FROM public.users
            WHERE auth_user_id = auth.uid()
        )
    );

-- Insert: Users can insert tags if they belong to the same company
CREATE POLICY "item_tags_insert_policy" ON "public"."item_tags"
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id IN (
            SELECT company_id
            FROM public.users
            WHERE auth_user_id = auth.uid()
        )
    );

-- Delete: Users can delete tags if they belong to the same company
CREATE POLICY "item_tags_delete_policy" ON "public"."item_tags"
    FOR DELETE
    TO authenticated
    USING (
        company_id IN (
            SELECT company_id
            FROM public.users
            WHERE auth_user_id = auth.uid()
        )
    );

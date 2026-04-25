-- Unified Tags Assignment Table
-- Replaces clients_tags, services_tags, tickets_tags, etc.

-- 1. Create item_tags table (Polymorphic association)
CREATE TABLE IF NOT EXISTS "public"."item_tags" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "tag_id" uuid NOT NULL REFERENCES "public"."global_tags"("id") ON DELETE CASCADE,
    "record_id" uuid NOT NULL, -- Polymorphic ID (client_id, ticket_id, etc.)
    "record_type" text NOT NULL, -- 'client', 'ticket', 'service', etc.
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_by" uuid REFERENCES "auth"."users"("id")
);

-- RLS Policies for item_tags
ALTER TABLE "public"."item_tags" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'item_tags' AND policyname = 'Enable read access for authenticated users'
    ) THEN
        CREATE POLICY "Enable read access for authenticated users" ON "public"."item_tags"
            FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'item_tags' AND policyname = 'Enable insert for authenticated users'
    ) THEN
        CREATE POLICY "Enable insert for authenticated users" ON "public"."item_tags"
            FOR INSERT TO authenticated WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'item_tags' AND policyname = 'Enable delete for authenticated users'
    ) THEN
        CREATE POLICY "Enable delete for authenticated users" ON "public"."item_tags"
            FOR DELETE TO authenticated USING (true);
    END IF;
END
$$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "item_tags_record_idx" ON "public"."item_tags" ("record_id", "record_type");
CREATE INDEX IF NOT EXISTS "item_tags_tag_idx" ON "public"."item_tags" ("tag_id");

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "item_tags_unique_idx" ON "public"."item_tags" ("tag_id", "record_id", "record_type");

-- 2. Link tag_scopes to modules
-- Ensure tag_scopes has module_key and it references modules(key)
DO $$
BEGIN
    -- Check if column exists, if not add it
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'tag_scopes' 
        AND column_name = 'module_key'
    ) THEN
        ALTER TABLE "public"."tag_scopes" ADD COLUMN "module_key" text;
    END IF;

    -- Check if constraint exists, if not add it
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'tag_scopes_module_key_fkey'
        AND table_name = 'tag_scopes'
    ) THEN
        -- Assuming 'modules' table exists and has a unique 'key' column
        -- Verify modules table existence first could be safer, but assuming based on user input
        ALTER TABLE "public"."tag_scopes"
        ADD CONSTRAINT "tag_scopes_module_key_fkey"
        FOREIGN KEY ("module_key")
        REFERENCES "public"."modules"("key")
        ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Update get_top_tags function
CREATE OR REPLACE FUNCTION get_top_tags(search_scope text, limit_count int)
RETURNS SETOF global_tags
LANGUAGE plpgsql
AS $$
DECLARE
    target_type text;
BEGIN
    -- Map scope plural (from UI) to singular record_type (DB convention)
    IF search_scope = 'clients' THEN target_type := 'client';
    ELSIF search_scope = 'tickets' THEN target_type := 'ticket';
    ELSIF search_scope = 'services' THEN target_type := 'service';
    ELSE target_type := search_scope;
    END IF;

    RETURN QUERY
    SELECT gt.*
    FROM global_tags gt
    JOIN item_tags it ON gt.id = it.tag_id
    WHERE it.record_type = target_type
    GROUP BY gt.id
    ORDER BY count(it.tag_id) DESC
    LIMIT limit_count;
END;
$$;

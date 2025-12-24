-- Create global_tags table
CREATE TABLE IF NOT EXISTS "public"."global_tags" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "name" text NOT NULL,
    "color" text DEFAULT '#6B7280'::text,
    "category" text,
    "scope" text[], -- Array of entity names: ['clients', 'tickets'] or NULL for all
    "description" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- specific constraint to ensure name is unique
ALTER TABLE "public"."global_tags" ADD CONSTRAINT "global_tags_name_key" UNIQUE ("name");

-- Enable RLS
ALTER TABLE "public"."global_tags" ENABLE ROW LEVEL SECURITY;

-- Create junction table for clients
CREATE TABLE IF NOT EXISTS "public"."clients_tags" (
    "client_id" uuid NOT NULL,
    "tag_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("client_id", "tag_id"),
    CONSTRAINT "clients_tags_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE,
    CONSTRAINT "clients_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."global_tags"("id") ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE "public"."clients_tags" ENABLE ROW LEVEL SECURITY;

-- Create junction table for tickets
CREATE TABLE IF NOT EXISTS "public"."tickets_tags" (
    "ticket_id" uuid NOT NULL,
    "tag_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("ticket_id", "tag_id"),
    CONSTRAINT "tickets_tags_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE,
    CONSTRAINT "tickets_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."global_tags"("id") ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE "public"."tickets_tags" ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to view all tags
CREATE POLICY "Allow read access for authenticated users" ON "public"."global_tags"
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow authenticated users to insert/update tags (adjust as needed for roles)
CREATE POLICY "Allow write access for authenticated users" ON "public"."global_tags"
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Clients Tags Policies
CREATE POLICY "Allow read access for clients_tags" ON "public"."clients_tags"
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow write access for clients_tags" ON "public"."clients_tags"
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Tickets Tags Policies
CREATE POLICY "Allow read access for tickets_tags" ON "public"."tickets_tags"
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow write access for tickets_tags" ON "public"."tickets_tags"
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Comments
COMMENT ON TABLE "public"."global_tags" IS 'Central repository for system-wide tags with scoping support';
COMMENT ON COLUMN "public"."global_tags"."scope" IS 'List of entities where this tag can be used. NULL or empty means global/all.';

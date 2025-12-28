-- Create global_tags table
CREATE TABLE IF NOT EXISTS "public"."global_tags" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "name" text NOT NULL,
    "color" text DEFAULT '#6B7280'::text,
    "category" text, -- e.g., 'Status', 'Priority', 'Department'
    "scope" text[], -- e.g., ['clients', 'tickets'] or NULL for all
    "description" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- RLS for global_tags
ALTER TABLE "public"."global_tags" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON "public"."global_tags"
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable write access for authenticated users" ON "public"."global_tags"
    FOR ALL TO authenticated USING (true);

-- Create junction table for Clients
CREATE TABLE IF NOT EXISTS "public"."clients_tags" (
    "client_id" uuid NOT NULL REFERENCES "public"."clients"("id") ON DELETE CASCADE,
    "tag_id" uuid NOT NULL REFERENCES "public"."global_tags"("id") ON DELETE CASCADE,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("client_id", "tag_id")
);

-- RLS for clients_tags
ALTER TABLE "public"."clients_tags" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON "public"."clients_tags"
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable write access for authenticated users" ON "public"."clients_tags"
    FOR ALL TO authenticated USING (true);

-- Create junction table for Tickets
CREATE TABLE IF NOT EXISTS "public"."tickets_tags" (
    "ticket_id" uuid NOT NULL REFERENCES "public"."tickets"("id") ON DELETE CASCADE,
    "tag_id" uuid NOT NULL REFERENCES "public"."global_tags"("id") ON DELETE CASCADE,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("ticket_id", "tag_id")
);

-- RLS for tickets_tags
ALTER TABLE "public"."tickets_tags" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON "public"."tickets_tags"
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable write access for authenticated users" ON "public"."tickets_tags"
    FOR ALL TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_global_tags_scope ON "public"."global_tags" USING gin ("scope");
CREATE INDEX IF NOT EXISTS idx_clients_tags_tag_id ON "public"."clients_tags" ("tag_id");
CREATE INDEX IF NOT EXISTS idx_tickets_tags_tag_id ON "public"."tickets_tags" ("tag_id");

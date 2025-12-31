-- Fix tickets_tags Foreign Keys to allow PostgREST resource embedding
-- Created on 2025-12-31

DO $$
BEGIN
    -- Check and add constraint for ticket_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tickets_tags_ticket_id_fkey'
    ) THEN
        ALTER TABLE "public"."tickets_tags"
        ADD CONSTRAINT "tickets_tags_ticket_id_fkey"
        FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;
    END IF;

    -- Check and add constraint for tag_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tickets_tags_tag_id_fkey'
    ) THEN
        ALTER TABLE "public"."tickets_tags"
        ADD CONSTRAINT "tickets_tags_tag_id_fkey"
        FOREIGN KEY ("tag_id") REFERENCES "public"."global_tags"("id") ON DELETE CASCADE;
    END IF;
END $$;

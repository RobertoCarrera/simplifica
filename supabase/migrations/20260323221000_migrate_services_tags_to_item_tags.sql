-- Migrate services_tags data to unified item_tags schema
-- Created: 2026-03-23
-- Purpose: Copy existing services-tags relationships to the unified item_tags table
--          to resolve schema inconsistencies and enable future tag unification

-- Copy all services_tags records to item_tags with record_type='service'
-- Use ON CONFLICT DO NOTHING to avoid duplicates if migration runs multiple times
INSERT INTO "public"."item_tags" ("tag_id", "record_id", "record_type", "created_at")
SELECT 
    st.tag_id,
    st.service_id AS record_id,
    'service' AS record_type,
    COALESCE(st.created_at, NOW()) AS created_at
FROM "public"."services_tags" st
ON CONFLICT ("tag_id", "record_id", "record_type") DO NOTHING;

-- Optional: Add comment to track migration
COMMENT ON TABLE "public"."services_tags" IS 'Legacy table - data migrated to item_tags with record_type=''service''. Consider deprecating after frontend updates.';
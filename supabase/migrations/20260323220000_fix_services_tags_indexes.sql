-- Fix missing indexes on services_tags to prevent PostgreSQL statement timeouts (error 57014)
-- Created: 2026-03-23
-- Purpose: Add indexes to services_tags table to prevent full table scans on queries filtering by service_id or tag_id

-- Index on service_id for queries like: /rest/v1/services_tags?service_id=eq.{id}
CREATE INDEX IF NOT EXISTS "services_tags_service_id_idx" ON "public"."services_tags" ("service_id");

-- Index on tag_id for queries like: /rest/v1/services_tags?tag_id=eq.{id}
CREATE INDEX IF NOT EXISTS "services_tags_tag_id_idx" ON "public"."services_tags" ("tag_id");

-- Note: IF NOT EXISTS ensures idempotency. Table locks during index creation are acceptable
-- because services_tags is a small junction table and indexes will create quickly.
-- Migration: Add custom_fields column to tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;
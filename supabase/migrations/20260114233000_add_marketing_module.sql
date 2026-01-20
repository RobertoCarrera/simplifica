-- Add Marketing Module to Catalog
-- Note: Assuming table name 'modules' or 'modules_catalog' based on context, 
-- but often these are hardcoded in an RPC or just a table.
-- Let's assume standard 'modules' table if it exists, or insert if valid.

-- First, check if 'modules' table exists or if it's managed via `modules_config`.
-- Based on `SupabaseModulesService` calling `get_effective_modules`, it likely queries a table.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'modules') THEN
        INSERT INTO public.modules (key, name, description, enabled_by_default)
        VALUES (
            'moduloMarketing', 
            'Marketing', 
            'Campañas de Email/WhatsApp', 
            true
        )
        ON CONFLICT (key) DO NOTHING;
    END IF;
END $$;

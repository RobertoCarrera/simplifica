-- Fix relationships for Global Tags System

-- 0. Ensure 'core' module exists (Pre-requisite for FK)
DO $$
BEGIN
   -- Verify if 'modules' table exists to avoid errors
   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'modules') THEN
       -- Insert 'core' module if it doesn't exist, to satisfy tag_scopes referencing it
       IF NOT EXISTS (SELECT 1 FROM "public"."modules" WHERE "key" = 'core') THEN
           INSERT INTO "public"."modules" ("key", "name", "description", "enabled_by_default", "is_active")
           VALUES ('core', 'Módulo Core', 'Funcionalidades base del sistema (Clientes, etc.)', true, true);
       END IF;
   END IF;
END $$;

-- 1. Fix missing FK in clients_tags (addressing the original 400 Bad Request)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'clients_tags_tag_id_fkey'
        AND table_name = 'clients_tags'
    ) THEN
        ALTER TABLE "public"."clients_tags"
        ADD CONSTRAINT "clients_tags_tag_id_fkey"
        FOREIGN KEY ("tag_id")
        REFERENCES "public"."global_tags"("id")
        ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Link tag_scopes to modules
DO $$
BEGIN
    -- Add module_key column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'tag_scopes'
        AND column_name = 'module_key'
    ) THEN
        ALTER TABLE "public"."tag_scopes" ADD COLUMN "module_key" text;
    END IF;

    -- Add Foreign Key constraint to modules table
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'tag_scopes_module_key_fkey'
        AND table_name = 'tag_scopes'
    ) THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'modules') THEN
            ALTER TABLE "public"."tag_scopes"
            ADD CONSTRAINT "tag_scopes_module_key_fkey"
            FOREIGN KEY ("module_key")
            REFERENCES "public"."modules"("key")
            ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

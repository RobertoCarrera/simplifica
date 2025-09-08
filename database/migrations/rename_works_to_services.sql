-- Script para renombrar tabla works a services
-- Ejecutar en Supabase SQL Editor

-- 1. Renombrar la tabla works a services
ALTER TABLE works RENAME TO services;

-- 2. Renombrar índices que referencien works
ALTER INDEX IF EXISTS idx_works_is_active RENAME TO idx_services_is_active;

-- 3. Renombrar constraints que referencien works
-- Rename constraint only if it exists (Postgres ALTER ... RENAME CONSTRAINT has no IF EXISTS)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'works_company_id_fkey'
    ) THEN
        EXECUTE 'ALTER TABLE services RENAME CONSTRAINT works_company_id_fkey TO services_company_id_fkey';
    END IF;
END;
$$;

-- 4. Verificar que todo esté correcto
SELECT 
    id, 
    name, 
    category, 
    base_price, 
    estimated_hours, 
    is_active,
    company_id
FROM services 
ORDER BY company_id, is_active DESC, name;

-- Comentarios sobre el script:
-- - Renombra la tabla works a services
-- - Actualiza índices y constraints relacionados
-- - Mantiene toda la estructura y datos existentes

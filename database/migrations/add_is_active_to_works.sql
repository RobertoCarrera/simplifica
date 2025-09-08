-- Script para añadir campo is_active a la tabla works (servicios)
-- Ejecutar en Supabase SQL Editor

-- 1. Añadir la columna is_active a la tabla works
ALTER TABLE works 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 1.b Añadir columnas que pueden no existir en la tabla works (category, base_price, estimated_hours)
-- Usamos IF NOT EXISTS para que la migración sea idempotente y no falle si ya existen
ALTER TABLE works
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Servicio Técnico';

ALTER TABLE works
ADD COLUMN IF NOT EXISTS base_price NUMERIC DEFAULT 0;

ALTER TABLE works
ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC DEFAULT 0;

-- 2. Actualizar todos los servicios existentes para que estén activos por defecto
UPDATE works 
SET is_active = true 
WHERE is_active IS NULL;

-- 3. Hacer que la columna sea NOT NULL ahora que todos los registros tienen un valor
ALTER TABLE works 
ALTER COLUMN is_active SET NOT NULL;

-- Asegurar que las nuevas columnas tengan valores por defecto para registros antiguos
UPDATE works
SET category = 'Servicio Técnico'
WHERE category IS NULL;

UPDATE works
SET base_price = 0
WHERE base_price IS NULL;

UPDATE works
SET estimated_hours = 0
WHERE estimated_hours IS NULL;

-- Si quieres forzar NOT NULL en las nuevas columnas, descomenta las líneas siguientes
-- ALTER TABLE works ALTER COLUMN category SET NOT NULL;
-- ALTER TABLE works ALTER COLUMN base_price SET NOT NULL;
-- ALTER TABLE works ALTER COLUMN estimated_hours SET NOT NULL;

-- 3.b Añadir columna company_id si no existe (para multi-tenant/backwards compatibility)
-- Queremos que company_id apunte a companies.id (UUID). Si existe una columna entera antigua,
-- la convertimos a UUID solo si es segura; sino creamos una nueva columna company_uuid.

-- 1) Añadir columna legacy_negocio_id para mapear con datos legacy si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'works' AND column_name = 'legacy_negocio_id'
    ) THEN
        ALTER TABLE works ADD COLUMN legacy_negocio_id TEXT;
        RAISE NOTICE 'Columna legacy_negocio_id agregada a works';
    END IF;
END$$;

-- 2) Añadir columna company_id de tipo UUID si no existe (para referenciar companies.id)
DO $$
DECLARE
    v_type TEXT;
BEGIN
    -- Revisar si existe columna company_id y su tipo
    SELECT data_type INTO v_type
    FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'company_id';

    IF NOT FOUND THEN
        -- No existe: crear directamente company_id UUID y poblar
        ALTER TABLE works ADD COLUMN company_id UUID;
        RAISE NOTICE 'Columna company_id (UUID) agregada a works';

        -- Poblar desde legacy_negocio_id cuando haya matches
        UPDATE works w
        SET company_id = c.id
        FROM companies c
        WHERE w.legacy_negocio_id IS NOT NULL
          AND c.legacy_negocio_id IS NOT NULL
          AND w.legacy_negocio_id = c.legacy_negocio_id
          AND w.company_id IS NULL;

        -- Fallback: asignar la primera company si sigue NULL
        UPDATE works
        SET company_id = (SELECT id FROM companies ORDER BY created_at LIMIT 1)
        WHERE company_id IS NULL;

        ALTER TABLE works ALTER COLUMN company_id SET NOT NULL;

    ELSIF v_type <> 'uuid' THEN
        -- Existe pero no es UUID (p.ej. integer): crear company_uuid temporal, poblar y renombrar
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'works' AND column_name = 'company_uuid'
        ) THEN
            ALTER TABLE works ADD COLUMN company_uuid UUID;
            RAISE NOTICE 'Columna company_uuid (temporal) agregada a works';
        END IF;

        -- Poblar company_uuid desde legacy_negocio_id
        EXECUTE 'UPDATE works w SET company_uuid = c.id FROM companies c WHERE w.legacy_negocio_id IS NOT NULL AND c.legacy_negocio_id IS NOT NULL AND w.legacy_negocio_id = c.legacy_negocio_id AND w.company_uuid IS NULL';

        -- Fallback: asignar primera company
        EXECUTE 'UPDATE works SET company_uuid = (SELECT id FROM companies ORDER BY created_at LIMIT 1) WHERE company_uuid IS NULL';

        -- Reemplazar la columna antigua por la nueva UUID
        ALTER TABLE works DROP COLUMN company_id;
        ALTER TABLE works RENAME COLUMN company_uuid TO company_id;
        ALTER TABLE works ALTER COLUMN company_id SET NOT NULL;

        RAISE NOTICE 'Columna company_id convertida a UUID mediante company_uuid temporal';

    ELSE
        -- Ya es UUID: sólo poblar valores faltantes
        UPDATE works w
        SET company_id = c.id
        FROM companies c
        WHERE w.legacy_negocio_id IS NOT NULL
          AND c.legacy_negocio_id IS NOT NULL
          AND w.legacy_negocio_id = c.legacy_negocio_id
          AND w.company_id IS NULL;

        UPDATE works
        SET company_id = (SELECT id FROM companies ORDER BY created_at LIMIT 1)
        WHERE company_id IS NULL;

        ALTER TABLE works ALTER COLUMN company_id SET NOT NULL;
    END IF;

    -- Crear constraint FK si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'works' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'company_id'
    ) THEN
        EXECUTE 'ALTER TABLE works ADD CONSTRAINT works_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT';
        RAISE NOTICE 'FK works(company_id) -> companies(id) creada';
    END IF;
END$$;

-- 4. Añadir un índice para optimizar las consultas por estado
CREATE INDEX IF NOT EXISTS idx_works_is_active ON works(is_active);

-- 5. Verificar que todo esté correcto
SELECT 
    id, 
    name, 
    category, 
    base_price, 
    estimated_hours, 
    is_active,
    company_id
FROM works 
ORDER BY company_id, is_active DESC, name;

-- Comentarios sobre el script:
-- - Se añade is_active con valor por defecto true
-- - Se actualizan todos los registros existentes
-- - Se añade índice para mejorar rendimiento
-- - Se mantiene compatibilidad con registros existentes

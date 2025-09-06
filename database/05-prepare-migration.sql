-- Script para verificar y crear las columnas necesarias para la migración
-- Ejecutar ANTES de la migración de datos

-- Verificar y agregar columna permissions a users
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'permissions'
    ) THEN
        ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT '{}'::jsonb;
        RAISE NOTICE 'Columna permissions agregada a tabla users';
    ELSE
        RAISE NOTICE 'Columna permissions ya existe en tabla users';
    END IF;
END $$;

-- Verificar y agregar columna website a companies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'companies' AND column_name = 'website'
    ) THEN
        ALTER TABLE companies ADD COLUMN website TEXT;
        RAISE NOTICE 'Columna website agregada a tabla companies';
    ELSE
        RAISE NOTICE 'Columna website ya existe en tabla companies';
    END IF;
END $$;

-- Verificar y agregar columna legacy_negocio_id a companies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'companies' AND column_name = 'legacy_negocio_id'
    ) THEN
        ALTER TABLE companies ADD COLUMN legacy_negocio_id TEXT;
        RAISE NOTICE 'Columna legacy_negocio_id agregada a tabla companies';
    ELSE
        RAISE NOTICE 'Columna legacy_negocio_id ya existe en tabla companies';
    END IF;
END $$;

-- Verificar estructura actual
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('users', 'companies')
ORDER BY table_name, ordinal_position;

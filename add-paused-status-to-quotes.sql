-- ============================================================
-- MIGRATION: Añadir estado 'paused' al ENUM quote_status
-- ============================================================
-- Este script añade el valor 'paused' al tipo ENUM quote_status
-- para permitir pausar presupuestos recurrentes sin perder
-- su configuración de recurrencia.
-- ============================================================

-- Verificar el tipo actual
DO $$ 
BEGIN
    -- Añadir 'paused' al ENUM si no existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'paused' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'quote_status')
    ) THEN
        ALTER TYPE quote_status ADD VALUE 'paused';
        RAISE NOTICE '✓ Valor "paused" añadido al ENUM quote_status';
    ELSE
        RAISE NOTICE '⚠ El valor "paused" ya existe en quote_status';
    END IF;
END $$;

-- Verificar todos los valores del ENUM
SELECT enumlabel as status_value 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'quote_status')
ORDER BY enumsortorder;

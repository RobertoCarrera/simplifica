-- ================================================================
-- VERIFICAR Y CREAR COLUMNAS DE HORAS EN TICKETS
-- ================================================================
-- Script para verificar la estructura actual de la tabla tickets
-- y agregar las columnas necesarias

-- Verificar estructura actual de la tabla tickets
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'tickets' 
    AND column_name IN ('estimated_hours', 'actual_hours')
ORDER BY column_name;

-- Verificar si existen tickets
SELECT COUNT(*) as total_tickets FROM tickets;

-- Verificar si existen servicios asociados a tickets
SELECT COUNT(*) as total_ticket_services FROM ticket_services;

-- Si no aparecen las columnas en la consulta anterior, ejecutar:
-- DO $$
-- BEGIN
--     -- Agregar estimated_hours si no existe
--     IF NOT EXISTS (
--         SELECT 1 FROM information_schema.columns 
--         WHERE table_name = 'tickets' 
--         AND column_name = 'estimated_hours'
--     ) THEN
--         ALTER TABLE tickets ADD COLUMN estimated_hours DECIMAL(5,2) DEFAULT 0;
--         RAISE NOTICE 'Columna estimated_hours agregada';
--     END IF;

--     -- Agregar actual_hours si no existe
--     IF NOT EXISTS (
--         SELECT 1 FROM information_schema.columns 
--         WHERE table_name = 'tickets' 
--         AND column_name = 'actual_hours'
--     ) THEN
--         ALTER TABLE tickets ADD COLUMN actual_hours DECIMAL(5,2) DEFAULT 0;
--         RAISE NOTICE 'Columna actual_hours agregada';
--     END IF;
-- END;
-- $$;

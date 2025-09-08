-- ================================================================
-- SCRIPT PARA AGREGAR COLUMNAS DE HORAS A LA TABLA TICKETS
-- ================================================================
-- Este script agrega las columnas estimated_hours y actual_hours 
-- a la tabla tickets si no existen

DO $$
BEGIN
    -- Verificar y agregar estimated_hours si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tickets' 
        AND column_name = 'estimated_hours'
    ) THEN
        ALTER TABLE tickets ADD COLUMN estimated_hours DECIMAL(5,2) DEFAULT 0;
        RAISE NOTICE 'Columna estimated_hours agregada a la tabla tickets';
    ELSE
        RAISE NOTICE 'Columna estimated_hours ya existe en la tabla tickets';
    END IF;

    -- Verificar y agregar actual_hours si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tickets' 
        AND column_name = 'actual_hours'
    ) THEN
        ALTER TABLE tickets ADD COLUMN actual_hours DECIMAL(5,2) DEFAULT 0;
        RAISE NOTICE 'Columna actual_hours agregada a la tabla tickets';
    ELSE
        RAISE NOTICE 'Columna actual_hours ya existe en la tabla tickets';
    END IF;

    -- Opcional: Calcular estimated_hours basado en servicios existentes
    -- Solo si la columna estimated_hours está vacía o es 0
    UPDATE tickets 
    SET estimated_hours = (
        SELECT COALESCE(SUM(s.estimated_hours * ts.quantity), 0)
        FROM ticket_services ts
        JOIN services s ON ts.service_id = s.id
        WHERE ts.ticket_id = tickets.id
    )
    WHERE (estimated_hours IS NULL OR estimated_hours = 0)
    AND EXISTS (
        SELECT 1 FROM ticket_services ts 
        WHERE ts.ticket_id = tickets.id
    );

    RAISE NOTICE 'Script completado. Columnas de horas agregadas y calculadas.';
END;
$$;

-- ================================================================
-- SCRIPT PARA ELIMINAR TABLA STAGES DUPLICADA
-- ================================================================
-- Ejecutar DESPUÉS del script principal cuando todo esté verificado

-- Verificar que no hay referencias activas a stages
DO $$
DECLARE
    refs_count integer;
BEGIN
    -- Contar referencias en tickets
    SELECT COUNT(*) INTO refs_count 
    FROM tickets t 
    JOIN stages s ON t.stage_id = s.id;
    
    IF refs_count > 0 THEN
        RAISE EXCEPTION 'STOP: Aún hay % tickets referenciando la tabla stages. No eliminar.', refs_count;
    END IF;
    
    RAISE NOTICE 'Verificación OK: No hay referencias activas a stages';
END $$;

-- Hacer backup de stages antes de eliminar (opcional)
CREATE TABLE IF NOT EXISTS stages_backup AS 
SELECT *, NOW() as backup_date FROM stages;

-- Eliminar tabla stages duplicada
DROP TABLE IF EXISTS stages CASCADE;

-- Mensaje: tabla stages eliminada exitosamente
SELECT 'Tabla stages eliminada exitosamente' AS notice;
SELECT 'Backup guardado en stages_backup si necesitas recuperar algo' AS notice;

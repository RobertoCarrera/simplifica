-- ================================================================
-- FUNCIÓN PARA CALCULAR ESTADÍSTICAS DE TICKETS EN EL BACKEND
-- ================================================================
-- Esta función calcula todas las estadísticas de tickets para una empresa
-- aliviando al frontend de cálculos complejos

CREATE OR REPLACE FUNCTION get_ticket_stats(target_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stats_result jsonb;
    total_tickets integer;
    open_tickets integer;
    in_progress_tickets integer;
    completed_tickets integer;
    overdue_tickets integer;
    total_revenue numeric;
    total_estimated_hours numeric;
    total_actual_hours numeric;
    avg_resolution_days numeric;
    completed_with_dates integer;
    total_resolution_time bigint;
BEGIN
    -- Verificar que la empresa existe
    IF NOT EXISTS (SELECT 1 FROM companies WHERE id = target_company_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Company with ID % does not exist or is deleted', target_company_id;
    END IF;
    
    -- Contar tickets totales
    SELECT COUNT(*) INTO total_tickets
    FROM tickets t
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL;
    
    -- Contar tickets abiertos/pendientes
    SELECT COUNT(*) INTO open_tickets
    FROM tickets t
    JOIN ticket_stages ts ON t.stage_id = ts.id
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL
    AND (
        ts.name ILIKE '%abierto%' OR 
        ts.name ILIKE '%pendiente%' OR 
        ts.name ILIKE '%nuevo%' OR 
        ts.name ILIKE '%recibido%'
    );
    
    -- Contar tickets en progreso
    SELECT COUNT(*) INTO in_progress_tickets
    FROM tickets t
    JOIN ticket_stages ts ON t.stage_id = ts.id
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL
    AND (
        ts.name ILIKE '%progreso%' OR 
        ts.name ILIKE '%proceso%' OR 
        ts.name ILIKE '%trabajando%' OR 
        ts.name ILIKE '%reparando%'
    );
    
    -- Contar tickets completados
    SELECT COUNT(*) INTO completed_tickets
    FROM tickets t
    JOIN ticket_stages ts ON t.stage_id = ts.id
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL
    AND (
        ts.name ILIKE '%completado%' OR 
        ts.name ILIKE '%finalizado%' OR 
        ts.name ILIKE '%terminado%' OR 
        ts.name ILIKE '%entregado%'
    );
    
    -- Contar tickets vencidos
    SELECT COUNT(*) INTO overdue_tickets
    FROM tickets t
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL
    AND t.due_date IS NOT NULL
    AND t.due_date < CURRENT_DATE;
    
    -- Calcular ingresos totales
    SELECT COALESCE(SUM(t.total_amount), 0) INTO total_revenue
    FROM tickets t
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL;
    
    -- Calcular horas estimadas totales desde servicios asociados
    SELECT COALESCE(SUM(s.estimated_hours * ts.quantity), 0) INTO total_estimated_hours
    FROM tickets t
    JOIN ticket_services ts ON t.id = ts.ticket_id
    JOIN services s ON ts.service_id = s.id
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL;
    
    -- Calcular horas reales totales (si existe la columna actual_hours en tickets)
    -- Si no existe, usar estimated_hours de la tabla tickets como fallback
    BEGIN
        SELECT COALESCE(SUM(t.actual_hours), 0) INTO total_actual_hours
        FROM tickets t
        WHERE t.company_id = target_company_id
        AND t.deleted_at IS NULL;
    EXCEPTION WHEN undefined_column THEN
        -- Si no existe actual_hours, usar estimated_hours de tickets
        SELECT COALESCE(SUM(t.estimated_hours), 0) INTO total_actual_hours
        FROM tickets t
        WHERE t.company_id = target_company_id
        AND t.deleted_at IS NULL;
    END;
    
    -- Calcular tiempo promedio de resolución en días
    -- Solo para tickets completados que tienen fechas válidas
    SELECT COUNT(*), COALESCE(SUM(EXTRACT(EPOCH FROM (t.updated_at - t.created_at))), 0)
    INTO completed_with_dates, total_resolution_time
    FROM tickets t
    JOIN ticket_stages ts ON t.stage_id = ts.id
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL
    AND (
        ts.name ILIKE '%completado%' OR 
        ts.name ILIKE '%finalizado%' OR 
        ts.name ILIKE '%terminado%' OR 
        ts.name ILIKE '%entregado%'
    )
    AND t.created_at IS NOT NULL
    AND t.updated_at IS NOT NULL
    AND t.updated_at > t.created_at;
    
    -- Convertir a días promedio
    IF completed_with_dates > 0 THEN
        avg_resolution_days := ROUND((total_resolution_time / completed_with_dates) / 86400, 1);
    ELSE
        avg_resolution_days := 0;
    END IF;
    
    -- Construir resultado JSON
    stats_result := jsonb_build_object(
        'total', total_tickets,
        'open', open_tickets,
        'inProgress', in_progress_tickets,
        'completed', completed_tickets,
        'overdue', overdue_tickets,
        'avgResolutionTime', avg_resolution_days,
        'totalRevenue', total_revenue,
        'totalEstimatedHours', total_estimated_hours,
        'totalActualHours', total_actual_hours,
        'calculatedAt', now(),
        'companyId', target_company_id
    );
    
    RETURN stats_result;
END;
$$;

-- ================================================================
-- FUNCIÓN PARA OBTENER ESTADÍSTICAS DE TODAS LAS EMPRESAS
-- ================================================================

CREATE OR REPLACE FUNCTION get_all_companies_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    company_record RECORD;
    all_stats jsonb := '[]'::jsonb;
    company_stats jsonb;
BEGIN
    -- Para cada empresa activa
    FOR company_record IN 
        SELECT id, name FROM companies WHERE deleted_at IS NULL ORDER BY name
    LOOP
        -- Obtener estadísticas de la empresa
        company_stats := get_ticket_stats(company_record.id);
        
        -- Añadir nombre de empresa
        company_stats := company_stats || jsonb_build_object('companyName', company_record.name);
        
        -- Agregar al array de resultados
        all_stats := all_stats || jsonb_build_array(company_stats);
    END LOOP;
    
    RETURN jsonb_build_object(
        'companies', all_stats,
        'totalCompanies', jsonb_array_length(all_stats),
        'generatedAt', now()
    );
END;
$$;

-- ================================================================
-- FUNCIÓN AUXILIAR PARA VERIFICAR COLUMNAS EXISTENTES
-- ================================================================

CREATE OR REPLACE FUNCTION column_exists(table_name text, column_name text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = column_exists.table_name 
        AND column_name = column_exists.column_name
    );
END;
$$;

-- ================================================================
-- EJEMPLOS DE USO
-- ================================================================

-- Comentarios con ejemplos de uso:

-- Para obtener estadísticas de una empresa específica:
-- SELECT get_ticket_stats('uuid-de-la-empresa');

-- Para obtener estadísticas de todas las empresas:
-- SELECT get_all_companies_stats();

-- Ejemplo de resultado JSON:
-- {
--   "total": 15,
--   "open": 3,
--   "inProgress": 8,
--   "completed": 4,
--   "overdue": 2,
--   "avgResolutionTime": 3.5,
--   "totalRevenue": 1250.00,
--   "totalEstimatedHours": 45.5,
--   "totalActualHours": 52.0,
--   "calculatedAt": "2024-12-15T10:30:00Z",
--   "companyId": "uuid-de-la-empresa"
-- }

SELECT 'Funciones de estadísticas creadas exitosamente' AS resultado;

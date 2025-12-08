-- ============================================================
-- LIMPIAR DUPLICADOS DEL SEED DATA
-- ============================================================
-- Este script elimina los presupuestos duplicados generados
-- por ejecutar el seed 3 veces, dejando solo los originales

DO $$
DECLARE
  v_company_id uuid := 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';
  v_deleted_count integer := 0;
BEGIN
  
  RAISE NOTICE '=== LIMPIANDO DUPLICADOS ===';
  
  -- Eliminar presupuestos con sequence_number > 7
  -- (mantener solo 6 recurrentes + 1 dropshipping)
  DELETE FROM quotes
  WHERE company_id = v_company_id
    AND quote_date >= '2025-10-01'
    AND sequence_number > 7;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Eliminados % presupuestos duplicados', v_deleted_count;
  RAISE NOTICE '=== COMPLETADO ===';
  
END $$;


-- Verificar presupuestos que quedan
SELECT 
  quote_number,
  TO_CHAR(quote_date, 'YYYY-MM-DD') as creado,
  TO_CHAR(last_run_at, 'YYYY-MM-DD') as ultima_facturacion,
  TO_CHAR(next_run_at, 'YYYY-MM-DD') as proxima_facturacion,
  status,
  conversion_status,
  recurrence_type,
  ROUND(subtotal, 2) as subtotal,
  ROUND(total_amount, 2) as total
FROM quotes
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
  AND quote_date >= '2025-10-01'
ORDER BY quote_date, sequence_number;

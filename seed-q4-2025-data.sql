-- ============================================================
-- SEED DATA Q4 2025 - Flujo Real de Presupuestos y Facturas
-- ============================================================

DO $$
DECLARE
  v_company_id uuid := 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';
  v_user_id uuid := '84efaa41-9734-4410-b0f2-9101e225ce0c';
  v_serie_id uuid := 'b40322fc-4b77-404a-969b-a78ef81520dd';
  
  -- Clientes reales
  v_client_michinanny uuid := 'f594a9f3-c319-4bc3-9a4b-b3b65debff55';
  v_client_gaticidad uuid := '4a7e1a78-750f-4956-9b84-b2c69bf924c1';
  v_client_gemma uuid := '98093c01-3bf9-4075-b376-b1a7ed0fbe48';
  v_client_dgerydo uuid := '69eb2615-732e-48e4-8fe7-f4dfc617a1c5';
  v_client_som uuid := 'd62eba67-2fab-44ba-aafe-3d920335c246';
  v_client_caibs uuid := 'eeaaf369-741b-4780-bcf9-595e5b812bf7';
  v_client_dropshipping uuid := '0737c4bf-4d57-47ce-ac8c-fe01f3f884ec';
  
  v_service_ids uuid[];
  v_service_id uuid;
  v_next_seq integer;
  
BEGIN
  
  -- Obtener servicios activos
  SELECT array_agg(id) INTO v_service_ids
  FROM services 
  WHERE company_id = v_company_id 
    AND is_active = true
  LIMIT 10;
  
  v_service_id := v_service_ids[1];
  RAISE NOTICE 'Usando servicio: %', v_service_id;
  
  -- Obtener el próximo número de secuencia disponible
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_next_seq
  FROM quotes
  WHERE company_id = v_company_id
    AND year = 2025;
  
  RAISE NOTICE 'Próximo sequence_number disponible: %', v_next_seq;
  RAISE NOTICE 'Próximo sequence_number disponible: %', v_next_seq;
  
  -- ============================================================
  -- OCTUBRE 2025 - Creación y Facturación de 6 Presupuestos Recurrentes
  -- ============================================================
  -- FLUJO RECURRENTE MENSUAL (día 27 de cada mes):
  --
  -- 27 OCTUBRE 2025:
  --   - Se crea el presupuesto (quote_date)
  --   - Se acepta inmediatamente (accepted_at)
  --   - Se factura automáticamente (invoiced_at)
  --   - Se registra la ejecución (last_run_at)
  --
  -- 27 NOVIEMBRE 2025:
  --   - El sistema repite automáticamente: acepta y factura
  --   - Se actualiza last_run_at a nov 27
  --
  -- 27 DICIEMBRE 2025 (MES ACTUAL):
  --   - Programado para ejecutarse (next_run_at)
  --   - El sistema repetirá: aceptar y facturar
  
  RAISE NOTICE '=== GENERANDO 6 PRESUPUESTOS RECURRENTES ===';
  RAISE NOTICE 'Fecha creación: 27 octubre 2025';
  RAISE NOTICE 'Primera facturación: 27 octubre 2025 (mismo día)';
  RAISE NOTICE 'Segunda facturación: 27 noviembre 2025 (automático)';
  RAISE NOTICE 'Próxima facturación: 27 diciembre 2025 (programado)';
  
  -- 1. Michinanny (45.00€) - Creado y facturado el 27 oct, refacturado el 27 nov
  INSERT INTO quotes (
    company_id, created_by, client_id, quote_number, year, sequence_number,
    status, conversion_status, quote_date, created_at, 
    accepted_at, invoiced_at,
    subtotal, tax_amount, total_amount, valid_until,
    recurrence_type, recurrence_interval, recurrence_day,
    next_run_at, last_run_at,
    title
  ) VALUES (
    v_company_id, v_user_id, v_client_michinanny, 
    '2025-Q-' || lpad(v_next_seq::text, 5, '0'), 2025, v_next_seq,
    'invoiced', 'converted', 
    '2025-10-27', '2025-10-27 09:00:00',  -- Creado el 27 octubre
    '2025-10-27 09:00:00', '2025-10-27 09:00:00',  -- Aceptado y facturado el mismo día
    45.00, 9.45, 54.45, '2025-11-27',
    'monthly', 1, 27,
    '2025-12-27 00:00:00',  -- Próxima ejecución: 27 diciembre
    '2025-11-27 00:00:00',  -- Última ejecución: 27 noviembre
    'Mantenimiento Web Michinanny'
  );
  v_next_seq := v_next_seq + 1;
  
  -- 2. Gaticidad (45.00€) - Creado y facturado el 27 oct, refacturado el 27 nov
  INSERT INTO quotes (
    company_id, created_by, client_id, quote_number, year, sequence_number,
    status, conversion_status, quote_date, created_at,
    accepted_at, invoiced_at,
    subtotal, tax_amount, total_amount, valid_until,
    recurrence_type, recurrence_interval, recurrence_day,
    next_run_at, last_run_at,
    title
  ) VALUES (
    v_company_id, v_user_id, v_client_gaticidad,
    '2025-Q-' || lpad(v_next_seq::text, 5, '0'), 2025, v_next_seq,
    'invoiced', 'converted',
    '2025-10-27', '2025-10-27 09:15:00',  -- Creado el 27 octubre
    '2025-10-27 09:15:00', '2025-10-27 09:15:00',  -- Aceptado y facturado el mismo día
    45.00, 9.45, 54.45, '2025-11-27',
    'monthly', 1, 27,
    '2025-12-27 00:00:00',  -- Próxima ejecución: 27 diciembre
    '2025-11-27 00:00:00',  -- Última ejecución: 27 noviembre
    'Mantenimiento Web Gaticidad'
  );
  v_next_seq := v_next_seq + 1;
  
  -- 3. Gemma Lahoz (49.00€) - Creado y facturado el 27 oct, refacturado el 27 nov
  INSERT INTO quotes (
    company_id, created_by, client_id, quote_number, year, sequence_number,
    status, conversion_status, quote_date, created_at,
    accepted_at, invoiced_at,
    subtotal, tax_amount, total_amount, valid_until,
    recurrence_type, recurrence_interval, recurrence_day,
    next_run_at, last_run_at,
    title
  ) VALUES (
    v_company_id, v_user_id, v_client_gemma,
    '2025-Q-' || lpad(v_next_seq::text, 5, '0'), 2025, v_next_seq,
    'invoiced', 'converted',
    '2025-10-27', '2025-10-27 09:30:00',  -- Creado el 27 octubre
    '2025-10-27 09:30:00', '2025-10-27 09:30:00',  -- Aceptado y facturado el mismo día
    49.00, 10.29, 59.29, '2025-11-27',
    'monthly', 1, 27,
    '2025-12-27 00:00:00',  -- Próxima ejecución: 27 diciembre
    '2025-11-27 00:00:00',  -- Última ejecución: 27 noviembre
    'Mantenimiento Web Gemma Lahoz'
  );
  v_next_seq := v_next_seq + 1;
  
  -- 4. DGeryDo (45.00€) - Creado y facturado el 27 oct, refacturado el 27 nov
  INSERT INTO quotes (
    company_id, created_by, client_id, quote_number, year, sequence_number,
    status, conversion_status, quote_date, created_at,
    accepted_at, invoiced_at,
    subtotal, tax_amount, total_amount, valid_until,
    recurrence_type, recurrence_interval, recurrence_day,
    next_run_at, last_run_at,
    title
  ) VALUES (
    v_company_id, v_user_id, v_client_dgerydo,
    '2025-Q-' || lpad(v_next_seq::text, 5, '0'), 2025, v_next_seq,
    'invoiced', 'converted',
    '2025-10-27', '2025-10-27 09:45:00',  -- Creado el 27 octubre
    '2025-10-27 09:45:00', '2025-10-27 09:45:00',  -- Aceptado y facturado el mismo día
    45.00, 9.45, 54.45, '2025-11-27',
    'monthly', 1, 27,
    '2025-12-27 00:00:00',  -- Próxima ejecución: 27 diciembre
    '2025-11-27 00:00:00',  -- Última ejecución: 27 noviembre
    'Mantenimiento App DGeryDo'
  );
  v_next_seq := v_next_seq + 1;
  
  -- 5. SOM (212.50€) - Creado y facturado el 27 oct, refacturado el 27 nov
  INSERT INTO quotes (
    company_id, created_by, client_id, quote_number, year, sequence_number,
    status, conversion_status, quote_date, created_at,
    accepted_at, invoiced_at,
    subtotal, tax_amount, total_amount, valid_until,
    recurrence_type, recurrence_interval, recurrence_day,
    next_run_at, last_run_at,
    title
  ) VALUES (
    v_company_id, v_user_id, v_client_som,
    '2025-Q-' || lpad(v_next_seq::text, 5, '0'), 2025, v_next_seq,
    'invoiced', 'converted',
    '2025-10-27', '2025-10-27 10:00:00',  -- Creado el 27 octubre
    '2025-10-27 10:00:00', '2025-10-27 10:00:00',  -- Aceptado y facturado el mismo día
    212.50, 44.63, 257.13, '2025-11-27',
    'monthly', 1, 27,
    '2025-12-27 00:00:00',  -- Próxima ejecución: 27 diciembre
    '2025-11-27 00:00:00',  -- Última ejecución: 27 noviembre
    'Mantenimiento Web SOM'
  );
  v_next_seq := v_next_seq + 1;
  
  -- 6. CAIBS (49.00€) - Creado y facturado el 27 oct, refacturado el 27 nov
  INSERT INTO quotes (
    company_id, created_by, client_id, quote_number, year, sequence_number,
    status, conversion_status, quote_date, created_at,
    accepted_at, invoiced_at,
    subtotal, tax_amount, total_amount, valid_until,
    recurrence_type, recurrence_interval, recurrence_day,
    next_run_at, last_run_at,
    title
  ) VALUES (
    v_company_id, v_user_id, v_client_caibs,
    '2025-Q-' || lpad(v_next_seq::text, 5, '0'), 2025, v_next_seq,
    'invoiced', 'converted',
    '2025-10-27', '2025-10-27 10:15:00',  -- Creado el 27 octubre
    '2025-10-27 10:15:00', '2025-10-27 10:15:00',  -- Aceptado y facturado el mismo día
    49.00, 10.29, 59.29, '2025-11-27',
    'monthly', 1, 27,
    '2025-12-27 00:00:00',  -- Próxima ejecución: 27 diciembre
    '2025-11-27 00:00:00',  -- Última ejecución: 27 noviembre
    'Mantenimiento Web CAIBS'
  );
  v_next_seq := v_next_seq + 1;
  
  RAISE NOTICE 'Creados 6 presupuestos recurrentes con historial:';
  RAISE NOTICE '  [27 OCT 2025] Creado, aceptado y facturado (1ª ejecución)';
  RAISE NOTICE '  [27 NOV 2025] Aceptado y facturado automáticamente (2ª ejecución)';
  RAISE NOTICE '  [27 DIC 2025] Programado para ejecutarse (3ª ejecución pendiente)';
  RAISE NOTICE '  Total: 445.50€ subtotal';
  
  -- ============================================================
  -- NOVIEMBRE 2025 - Presupuesto Único (No Recurrente)
  -- ============================================================
  
  RAISE NOTICE '=== GENERANDO DATOS DE NOVIEMBRE 2025 ===';
  
  INSERT INTO quotes (
    company_id, created_by, client_id, quote_number, year, sequence_number,
    status, conversion_status, quote_date, created_at,
    subtotal, tax_amount, total_amount, valid_until,
    recurrence_type,
    title, description
  ) VALUES (
    v_company_id, v_user_id, v_client_dropshipping,
    '2025-Q-' || lpad(v_next_seq::text, 5, '0'), 2025, v_next_seq,
    'sent', 'not_converted', '2025-11-18', '2025-11-18 19:00:00',
    1170.00, 245.70, 1415.70, '2025-12-18',
    'none',
    'Web Dropshipping', 'Web de dropshipping básica de 30 productos'
  );
  
  RAISE NOTICE 'Creado presupuesto dropshipping de noviembre';
  RAISE NOTICE '=== COMPLETADO ===';
  
END $$;


-- Verificar presupuestos creados
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

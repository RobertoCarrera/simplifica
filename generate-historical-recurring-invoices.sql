-- ============================================================
-- SCRIPT: Generar facturas históricas de presupuestos recurrentes
-- ============================================================
-- Este script genera facturas para los últimos 2 meses basándose
-- en los presupuestos recurrentes activos.
-- 
-- IMPORTANTE: Ejecutar DESPUÉS de tener configurados los presupuestos
-- recurrentes en la base de datos.
-- ============================================================

DO $$
DECLARE
  v_quote RECORD;
  v_invoice_id uuid;
  v_invoice_number varchar;
  v_invoice_date date;
  v_period varchar(7);
  v_series_id uuid;
  v_company_id uuid;
  v_item RECORD;
  v_months_back int;
  v_current_date date := CURRENT_DATE;
  v_generated_count int := 0;
BEGIN
  -- Obtener el company_id del JWT (ajustar según tu configuración)
  v_company_id := 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'; -- Reemplazar con tu company_id
  
  RAISE NOTICE '=== Generando facturas históricas para los últimos 2 meses ===';
  RAISE NOTICE 'Company ID: %', v_company_id;
  RAISE NOTICE 'Fecha actual: %', v_current_date;
  RAISE NOTICE '';
  
  -- Obtener serie por defecto o la primera activa
  SELECT id INTO v_series_id
  FROM public.invoice_series
  WHERE company_id = v_company_id
    AND is_active = true
  ORDER BY is_default DESC NULLS LAST, created_at
  LIMIT 1;
  
  IF v_series_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ninguna serie de facturación activa para la empresa';
  END IF;
  
  RAISE NOTICE 'Serie de facturación: %', v_series_id;
  RAISE NOTICE '';
  
  -- Iterar sobre cada presupuesto recurrente activo
  FOR v_quote IN 
    SELECT 
      q.*,
      c.name as client_name,
      c.email as client_email
    FROM public.quotes q
    LEFT JOIN public.clients c ON c.id = q.client_id
    WHERE q.company_id = v_company_id
      AND q.deleted_at IS NULL
      AND q.recurrence_type IS NOT NULL
      AND q.recurrence_type != 'none'
      AND q.status IN ('accepted', 'sent', 'invoiced')
    ORDER BY q.quote_number
  LOOP
    RAISE NOTICE '--- Procesando presupuesto: % (%) ---', v_quote.quote_number, v_quote.title;
    RAISE NOTICE 'Cliente: %', v_quote.client_name;
    RAISE NOTICE 'Recurrencia: %', v_quote.recurrence_type;
    
    -- Generar facturas para los últimos 2 meses
    FOR v_months_back IN 1..2 LOOP
      -- Calcular la fecha de factura (último día del mes correspondiente)
      v_invoice_date := (DATE_TRUNC('month', v_current_date) - INTERVAL '1 month' * v_months_back + INTERVAL '1 month' - INTERVAL '1 day')::date;
      v_period := TO_CHAR(v_invoice_date, 'YYYY-MM');
      
      -- Verificar si ya existe una factura para este período
      IF EXISTS (
        SELECT 1 FROM public.invoices
        WHERE source_quote_id = v_quote.id
          AND recurrence_period = v_period
          AND deleted_at IS NULL
      ) THEN
        RAISE NOTICE '  ⚠ Ya existe factura para período %', v_period;
        CONTINUE;
      END IF;
      
      -- Obtener el siguiente número de factura
      SELECT 
        s.series_code || '-' || s.prefix || LPAD(s.next_number::text, 5, '0'),
        s.next_number
      INTO v_invoice_number, v_invoice_id
      FROM public.invoice_series s
      WHERE s.id = v_series_id;
      
      -- Crear la factura
      INSERT INTO public.invoices (
        id,
        company_id,
        client_id,
        series_id,
        invoice_number,
        invoice_series,
        invoice_type,
        invoice_date,
        due_date,
        subtotal,
        tax_amount,
        total,
        paid_amount,
        currency,
        status,
        payment_status,
        gdpr_legal_basis,
        source_quote_id,
        recurrence_period,
        is_recurring,
        notes,
        created_by
      ) VALUES (
        gen_random_uuid(),
        v_company_id,
        v_quote.client_id,
        v_series_id,
        v_invoice_number,
        (SELECT series_code FROM public.invoice_series WHERE id = v_series_id),
        'normal',
        v_invoice_date,
        v_invoice_date + INTERVAL '30 days', -- Vencimiento 30 días
        v_quote.subtotal,
        v_quote.tax_amount,
        v_quote.total_amount,
        v_quote.total_amount, -- Marcar como pagada
        COALESCE(v_quote.currency, 'EUR'),
        'paid', -- Estado: pagada
        'paid', -- Estado de pago: pagada
        'contract', -- Base legal GDPR
        v_quote.id, -- Referencia al presupuesto origen
        v_period, -- Período de facturación (YYYY-MM)
        true, -- Marca de factura recurrente
        'Factura generada automáticamente - Período: ' || v_period,
        v_quote.created_by
      ) RETURNING id INTO v_invoice_id;
      
      -- Actualizar el contador de la serie
      UPDATE public.invoice_series
      SET next_number = next_number + 1
      WHERE id = v_series_id;
      
      -- Copiar los items del presupuesto a la factura
      FOR v_item IN 
        SELECT * FROM public.quote_items
        WHERE quote_id = v_quote.id
        ORDER BY line_order
      LOOP
        INSERT INTO public.invoice_items (
          id,
          invoice_id,
          line_order,
          description,
          quantity,
          unit_price,
          discount_percent,
          tax_rate,
          tax_amount,
          subtotal,
          total,
          product_id,
          service_id
        ) VALUES (
          gen_random_uuid(),
          v_invoice_id,
          v_item.line_order,
          v_item.description,
          v_item.quantity,
          v_item.unit_price,
          v_item.discount_percent,
          v_item.tax_rate,
          v_item.tax_amount,
          v_item.subtotal,
          v_item.total,
          v_item.product_id,
          v_item.service_id
        );
      END LOOP;
      
      v_generated_count := v_generated_count + 1;
      RAISE NOTICE '  ✓ Factura creada: % para período %', v_invoice_number, v_period;
      
    END LOOP; -- Fin de loop de meses
    
    RAISE NOTICE '';
    
  END LOOP; -- Fin de loop de presupuestos
  
  RAISE NOTICE '';
  RAISE NOTICE '=== RESUMEN ===';
  RAISE NOTICE 'Total de facturas generadas: %', v_generated_count;
  RAISE NOTICE '';
  RAISE NOTICE '✓ Proceso completado exitosamente';
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '';
  RAISE NOTICE '❌ ERROR: %', SQLERRM;
  RAISE NOTICE 'DETALLE: %', SQLSTATE;
  RAISE;
END $$;

-- ============================================================
-- VERIFICACIÓN: Consultar las facturas generadas
-- ============================================================
-- Descomentar para ver un resumen de las facturas generadas:

/*
SELECT 
  i.invoice_number,
  i.invoice_date,
  i.recurrence_period,
  c.name as cliente,
  q.quote_number as presupuesto_origen,
  q.title as titulo_presupuesto,
  i.total,
  i.status,
  i.created_at
FROM public.invoices i
LEFT JOIN public.quotes q ON q.id = i.source_quote_id
LEFT JOIN public.clients c ON c.id = i.client_id
WHERE i.is_recurring = true
  AND i.recurrence_period >= TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM')
ORDER BY i.recurrence_period DESC, i.invoice_number;
*/

-- ============================================================
-- LIMPIEZA (Solo si es necesario reejecutar el script)
-- ============================================================
-- ⚠️ CUIDADO: Esto eliminará TODAS las facturas recurrentes generadas
-- Descomentar solo si necesitas empezar de cero:

/*
DELETE FROM public.invoice_items
WHERE invoice_id IN (
  SELECT id FROM public.invoices 
  WHERE is_recurring = true
);

DELETE FROM public.invoices
WHERE is_recurring = true;

-- Reiniciar contadores de series si es necesario
-- UPDATE public.invoice_series 
-- SET next_number = 1 
-- WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';
*/

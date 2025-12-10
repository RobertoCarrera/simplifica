-- Script para crear 6 presupuestos recurrentes de prueba y generar facturas históricas
-- Ejecutar en Supabase SQL Editor

-- Primero, eliminar el constraint único que impide múltiples facturas por presupuesto
DROP INDEX IF EXISTS public.invoices_source_quote_unique;

DO $$
DECLARE
  v_company_id uuid := 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';
  v_user_id uuid;
  v_auth_user_id uuid;
  v_series_id uuid;
  v_clients uuid[];
  v_quote_id uuid;
  v_invoice_id uuid;
  v_base_date date;
  v_month_offset int;
  v_invoice_number int;
  v_series_code text;
  v_quote_number int;
  v_prices_include_tax boolean;
  i int;
BEGIN
  -- Obtener configuración de impuestos: empresa > global > default false
  SELECT prices_include_tax INTO v_prices_include_tax
  FROM company_settings
  WHERE company_id = v_company_id;

  -- Si no hay configuración de empresa, usar la global
  IF v_prices_include_tax IS NULL THEN
    SELECT default_prices_include_tax INTO v_prices_include_tax
    FROM app_settings
    WHERE company_id = v_company_id;
  END IF;

  -- Default: FALSE
  v_prices_include_tax := COALESCE(v_prices_include_tax, false);

  RAISE NOTICE 'Configuración de impuestos - prices_include_tax: %', v_prices_include_tax;

  -- Obtener usuario de la tabla users de la empresa (para invoices.created_by)
  SELECT id, auth_user_id INTO v_user_id, v_auth_user_id
  FROM public.users
  WHERE company_id = v_company_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ningún usuario para la empresa';
  END IF;

  RAISE NOTICE 'Usando usuario: % (auth: %)', v_user_id, v_auth_user_id;

  -- Obtener la primera serie disponible o la serie por defecto
  SELECT id, series_code INTO v_series_id, v_series_code
  FROM invoice_series 
  WHERE company_id = v_company_id 
  ORDER BY is_default DESC NULLS LAST, created_at ASC
  LIMIT 1;

  IF v_series_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ninguna serie de facturas para la empresa';
  END IF;
  
  RAISE NOTICE 'Usando serie: %', v_series_code;

  -- Seleccionar 6 clientes aleatorios
  SELECT array_agg(id) INTO v_clients
  FROM (
    SELECT id FROM clients 
    WHERE company_id = v_company_id 
    ORDER BY random() 
    LIMIT 6
  ) random_clients;

  IF array_length(v_clients, 1) < 6 THEN
    RAISE EXCEPTION 'No hay suficientes clientes (se necesitan 6, hay %)', array_length(v_clients, 1);
  END IF;

  -- Obtener el siguiente número de presupuesto
  SELECT COALESCE(MAX(CAST(quote_number AS INTEGER)), 0) + 1 
  INTO v_quote_number
  FROM quotes 
  WHERE company_id = v_company_id 
  AND quote_number ~ '^\d+$';

  RAISE NOTICE 'Iniciando creación de 6 presupuestos recurrentes...';

  -- Crear 6 presupuestos recurrentes
  FOR i IN 1..6 LOOP
    -- Crear el presupuesto
    INSERT INTO quotes (
      company_id,
      client_id,
      created_by,
      quote_number,
      year,
      sequence_number,
      title,
      quote_date,
      valid_until,
      subtotal,
      tax_amount,
      total_amount,
      currency,
      status,
      recurrence_type,
      recurrence_interval,
      recurrence_day,
      next_run_at,
      last_run_at,
      notes
    ) VALUES (
      v_company_id,
      v_clients[i],
      v_auth_user_id,  -- quotes usa auth.users
      v_quote_number::text,
      EXTRACT(YEAR FROM CURRENT_DATE)::integer,
      v_quote_number,
      'Mantenimiento mensual - Cliente ' || i,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '1 year',
      -- Subtotal: Si prices_include_tax, extraer base imponible. Si no, es el precio directo.
      CASE 
        WHEN v_prices_include_tax THEN ROUND((50 + (i * 25))::numeric / 1.21, 2)
        ELSE (50 + (i * 25))::numeric
      END,
      -- Tax Amount: Siempre es el 21% del subtotal
      CASE 
        WHEN v_prices_include_tax THEN ROUND((50 + (i * 25))::numeric - ((50 + (i * 25))::numeric / 1.21), 2)
        ELSE ROUND((50 + (i * 25))::numeric * 0.21, 2)
      END,
      -- Total: Siempre es lo que paga el cliente (subtotal + IVA)
      CASE 
        WHEN v_prices_include_tax THEN (50 + (i * 25))::numeric  -- El precio ya es el total
        ELSE ROUND((50 + (i * 25))::numeric * 1.21, 2)           -- Precio + IVA
      END,
      'EUR',
      'accepted',
      'monthly',
      1,
      15,  -- Día 15 de cada mes
      (CURRENT_DATE + INTERVAL '1 month')::date,  -- Próxima ejecución: siguiente mes
      NULL,
      'Presupuesto recurrente de prueba generado automáticamente'
    )
    RETURNING id INTO v_quote_id;

    RAISE NOTICE 'Creado presupuesto P-% (ID: %)', v_quote_number, v_quote_id;

    -- Insertar item del presupuesto
    -- NOTA: unit_price es lo que introduce el usuario (150€)
    -- Si prices_include_tax=true: 150€ ya incluye IVA, subtotal=123.97, tax=26.03, total=150
    -- Si prices_include_tax=false: 150€ es neto, subtotal=150, tax=31.50, total=181.50
    INSERT INTO quote_items (
      quote_id,
      company_id,
      line_number,
      description,
      quantity,
      unit_price,
      discount_percent,
      tax_rate,
      tax_amount,
      subtotal,
      total
    ) VALUES (
      v_quote_id,
      v_company_id,
      1,
      'Servicio de mantenimiento mensual',
      1,
      (50 + (i * 25))::numeric,  -- unit_price: siempre el precio que introduce el usuario
      0,
      21,
      -- tax_amount
      CASE 
        WHEN v_prices_include_tax THEN ROUND((50 + (i * 25))::numeric - ((50 + (i * 25))::numeric / 1.21), 2)
        ELSE ROUND((50 + (i * 25))::numeric * 0.21, 2)
      END,
      -- subtotal (base imponible)
      CASE 
        WHEN v_prices_include_tax THEN ROUND((50 + (i * 25))::numeric / 1.21, 2)
        ELSE (50 + (i * 25))::numeric
      END,
      -- total (lo que paga el cliente)
      CASE 
        WHEN v_prices_include_tax THEN (50 + (i * 25))::numeric
        ELSE ROUND((50 + (i * 25))::numeric * 1.21, 2)
      END
    );

    v_quote_number := v_quote_number + 1;

    -- Generar facturas históricas (últimos 3 meses) solo para este presupuesto
    FOR v_month_offset IN 1..3 LOOP
      v_base_date := (CURRENT_DATE - (v_month_offset || ' months')::interval)::date;
      
      -- Obtener el siguiente número de factura
      SELECT COALESCE(MAX(CAST(invoice_number AS INTEGER)), 0) + 1
      INTO v_invoice_number
      FROM invoices
      WHERE company_id = v_company_id
      AND series_id = v_series_id
      AND invoice_number ~ '^\d+$';

      -- Crear la factura histórica
      INSERT INTO invoices (
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
        currency,
        status,
        payment_status,
        notes,
        created_by,
        source_quote_id,
        recurrence_period
      ) VALUES (
        v_company_id,
        v_clients[i],
        v_series_id,
        v_invoice_number,
        v_series_code,
        'normal',
        v_base_date,
        v_base_date + INTERVAL '30 days',
        -- subtotal (base imponible)
        CASE 
          WHEN v_prices_include_tax THEN ROUND((50 + (i * 25))::numeric / 1.21, 2)
          ELSE (50 + (i * 25))::numeric
        END,
        -- tax_amount
        CASE 
          WHEN v_prices_include_tax THEN ROUND((50 + (i * 25))::numeric - ((50 + (i * 25))::numeric / 1.21), 2)
          ELSE ROUND((50 + (i * 25))::numeric * 0.21, 2)
        END,
        -- total (lo que paga el cliente)
        CASE 
          WHEN v_prices_include_tax THEN (50 + (i * 25))::numeric
          ELSE ROUND((50 + (i * 25))::numeric * 1.21, 2)
        END,
        'EUR',
        'approved',
        'paid',  -- Estado: pagada
        format('Factura recurrente desde presupuesto P-%s - Período: %s', 
               v_quote_number::text, 
               to_char(v_base_date, 'YYYY-MM')),
        v_user_id,  -- invoices usa public.users
        v_quote_id,  -- Vinculación con el presupuesto
        to_char(v_base_date, 'YYYY-MM')
      )
      RETURNING id INTO v_invoice_id;

      -- Insertar item de la factura
      INSERT INTO invoice_items (
        invoice_id,
        line_order,
        description,
        quantity,
        unit_price,
        discount_percent,
        tax_rate,
        tax_amount,
        subtotal,
        total
      ) VALUES (
        v_invoice_id,
        1,
        'Servicio de mantenimiento mensual',
        1,
        (50 + (i * 25))::numeric,  -- unit_price: el precio que introduce el usuario
        0,
        21,
        -- tax_amount
        CASE 
          WHEN v_prices_include_tax THEN ROUND((50 + (i * 25))::numeric - ((50 + (i * 25))::numeric / 1.21), 2)
          ELSE ROUND((50 + (i * 25))::numeric * 0.21, 2)
        END,
        -- subtotal (base imponible)
        CASE 
          WHEN v_prices_include_tax THEN ROUND((50 + (i * 25))::numeric / 1.21, 2)
          ELSE (50 + (i * 25))::numeric
        END,
        -- total (lo que paga el cliente)
        CASE 
          WHEN v_prices_include_tax THEN (50 + (i * 25))::numeric
          ELSE ROUND((50 + (i * 25))::numeric * 1.21, 2)
        END
      );

      -- Recalcular totales
      PERFORM calculate_invoice_totals(v_invoice_id);

      RAISE NOTICE '  -> Factura histórica %-%: % (período %)', 
                   v_series_code, v_invoice_number, to_char(v_base_date, 'YYYY-MM-DD'),
                   to_char(v_base_date, 'YYYY-MM');
    END LOOP;

  END LOOP;

  RAISE NOTICE '✓ Proceso completado: 6 presupuestos recurrentes creados con 3 facturas históricas cada uno (18 facturas totales)';

END $$;

-- Verificar los presupuestos creados
SELECT 
  q.full_quote_number,
  c.name as cliente,
  q.total_amount,
  q.recurrence_type,
  q.next_run_at,
  q.status
FROM quotes q
JOIN clients c ON c.id = q.client_id
WHERE q.company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
AND q.recurrence_type = 'monthly'
ORDER BY q.created_at DESC
LIMIT 6;

-- Verificar las facturas históricas generadas
SELECT 
  i.invoice_series || '-' || i.invoice_number as numero_factura,
  c.name as cliente,
  i.invoice_date,
  i.recurrence_period,
  i.total,
  i.payment_status,
  q.full_quote_number as presupuesto_origen
FROM invoices i
JOIN clients c ON c.id = i.client_id
LEFT JOIN quotes q ON q.id = i.source_quote_id
WHERE i.company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
AND i.recurrence_period IS NOT NULL
ORDER BY i.invoice_date DESC, i.invoice_number DESC;

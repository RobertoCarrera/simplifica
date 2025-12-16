-- ========================================================
-- FIX DEFINITIVO: Error "finalized" no existe en enum
-- ========================================================
-- EJECUTAR EN SUPABASE SQL EDITOR - COPIAR TODO
-- ========================================================

-- PASO 1: Eliminar TODAS las versiones de convert_quote_to_invoice
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE p.proname = 'convert_quote_to_invoice'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    RAISE NOTICE 'Dropped: %', r.func_signature;
  END LOOP;
END $$;

-- PASO 2: Crear la función con el status CORRECTO ('draft')
CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(
  p_quote_id uuid,
  p_invoice_series_id uuid default null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote public.quotes%rowtype;
  v_invoice_id uuid;
  v_series_id uuid;
  v_series_label text;
  v_invoice_number text;
  v_item record;
  v_invoice_type invoice_type;
  v_recurrence_period text;
  v_is_recurring boolean;
  v_created_by uuid;
BEGIN
  -- Load quote
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  -- Validate state
  IF v_quote.status <> 'accepted' AND v_quote.status <> 'invoiced' THEN
    RAISE EXCEPTION 'Solo se pueden convertir presupuestos aceptados';
  END IF;
  IF v_quote.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este presupuesto ya fue convertido a factura';
  END IF;

  -- Determinar el tipo de factura
  IF v_quote.rectifies_invoice_id IS NOT NULL OR (v_quote.total_amount < 0) THEN
    v_invoice_type := 'rectificative'::invoice_type;
  ELSE
    v_invoice_type := 'normal'::invoice_type;
  END IF;

  -- Determine if this is a recurring quote
  v_is_recurring := v_quote.recurrence_type IS NOT NULL AND v_quote.recurrence_type <> 'none';
  
  IF v_is_recurring THEN
    v_recurrence_period := to_char(current_date, 'YYYY-MM');
  ELSE
    v_recurrence_period := NULL;
  END IF;

  -- Resolve series
  IF p_invoice_series_id IS NULL THEN
    SELECT id INTO v_series_id
    FROM public.invoice_series
    WHERE company_id = v_quote.company_id
      AND is_active = true
      AND is_default = true
    ORDER BY year DESC
    LIMIT 1;
  ELSE
    v_series_id := p_invoice_series_id;
  END IF;
  
  IF v_series_id IS NULL THEN
    RAISE EXCEPTION 'No hay serie de factura por defecto configurada';
  END IF;

  -- Build series label
  SELECT (year::text || '-' || series_code) INTO v_series_label 
  FROM public.invoice_series WHERE id = v_series_id;
  
  SELECT get_next_invoice_number(v_series_id) INTO v_invoice_number;

  -- Determine created_by
  SELECT id INTO v_created_by FROM public.users WHERE id = v_quote.created_by;
  
  IF v_created_by IS NULL THEN
    SELECT id INTO v_created_by
    FROM public.users
    WHERE company_id = v_quote.company_id
    ORDER BY role = 'owner' DESC, created_at ASC
    LIMIT 1;
  END IF;
  
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'No valid user found for company %', v_quote.company_id;
  END IF;

  -- INSERT con status = 'draft' (valor válido del enum)
  INSERT INTO public.invoices (
    company_id, client_id, series_id, invoice_number, invoice_series,
    invoice_type, invoice_date, due_date, subtotal, tax_amount, total,
    currency, status, notes, rectifies_invoice_id, rectification_reason,
    created_by, source_quote_id, recurrence_period
  ) VALUES (
    v_quote.company_id,
    v_quote.client_id,
    v_series_id,
    v_invoice_number,
    v_series_label,
    v_invoice_type,
    current_date,
    current_date + interval '30 days',
    v_quote.subtotal,
    v_quote.tax_amount,
    v_quote.total_amount,
    v_quote.currency,
    'draft',  -- <<< CORRECTO: 'draft' existe en el enum
    'Generada desde presupuesto: ' || coalesce(v_quote.full_quote_number, v_quote.quote_number),
    v_quote.rectifies_invoice_id,
    v_quote.rectification_reason,
    v_created_by,
    CASE WHEN v_is_recurring THEN p_quote_id ELSE NULL END,
    v_recurrence_period
  ) RETURNING id INTO v_invoice_id;

  -- Copy items
  FOR v_item IN
    SELECT * FROM public.quote_items WHERE quote_id = p_quote_id ORDER BY line_number
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id, line_order, description, quantity, unit_price,
      discount_percent, tax_rate, tax_amount, subtotal, total
    ) VALUES (
      v_invoice_id,
      v_item.line_number,
      v_item.description,
      v_item.quantity,
      v_item.unit_price,
      COALESCE(v_item.discount_percent, 0),
      v_item.tax_rate,
      v_item.tax_amount,
      v_item.subtotal,
      v_item.total
    );
  END LOOP;

  -- Update quote
  UPDATE public.quotes
  SET invoice_id = v_invoice_id,
      status = 'invoiced',
      invoiced_at = now(),
      updated_at = now(),
      last_run_at = CASE WHEN v_is_recurring THEN now() ELSE last_run_at END
  WHERE id = p_quote_id;

  RETURN v_invoice_id;
END
$$;

-- PASO 3: Verificar que se creó correctamente
SELECT 'FUNCIÓN CREADA - Verificando...' AS paso;

SELECT 
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%''draft''%' THEN '✅ CORRECTO: La función usa draft'
    ELSE '❌ ERROR: La función NO usa draft'
  END AS verificacion
FROM pg_proc 
WHERE proname = 'convert_quote_to_invoice'
LIMIT 1;

-- PASO 4: Mostrar qué contiene la función
SELECT 
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%finalized%' THEN '❌ CONTIENE finalized (MAL)'
    ELSE '✅ NO contiene finalized (BIEN)'
  END AS check_finalized
FROM pg_proc 
WHERE proname = 'convert_quote_to_invoice'
LIMIT 1;

SELECT '✅ FIX APLICADO - Prueba contratar de nuevo' AS resultado;

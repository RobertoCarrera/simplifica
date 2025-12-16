-- ============================================================================
-- FIX FINAL: convert_quote_to_invoice
-- ============================================================================
-- Ejecutar en Supabase SQL Editor
-- ESTE ES EL ÚNICO ARCHIVO QUE NECESITAS EJECUTAR
-- ============================================================================

-- PASO 1: Ver qué funciones existen (para diagnóstico)
SELECT 
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.oid
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'convert_quote_to_invoice'
AND n.nspname = 'public';

-- PASO 2: Eliminar TODAS las versiones de la función
DROP FUNCTION IF EXISTS public.convert_quote_to_invoice(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.convert_quote_to_invoice(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.convert_quote_to_invoice(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.convert_quote_to_invoice(uuid, text) CASCADE;

-- PASO 3: Verificar que se eliminaron
SELECT 
  COUNT(*) as remaining_functions
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'convert_quote_to_invoice'
AND n.nspname = 'public';
-- Debería retornar 0

-- PASO 4: Crear la función CORRECTA con 'draft' (NO 'finalized')
CREATE FUNCTION public.convert_quote_to_invoice(
  p_quote_id uuid,
  p_invoice_series_id uuid default null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
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
  
  -- Calculate recurrence_period
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

  -- Build series label and get next number
  SELECT (year::text || '-' || series_code) INTO v_series_label 
    FROM public.invoice_series WHERE id = v_series_id;
  SELECT get_next_invoice_number(v_series_id) INTO v_invoice_number;

  -- VALIDAR created_by: si no existe en users, usar el propietario de la empresa
  IF v_quote.created_by IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_quote.created_by) THEN
    -- Intentar obtener el owner de la empresa
    SELECT id INTO v_created_by 
      FROM public.users 
     WHERE company_id = v_quote.company_id 
       AND role = 'owner'
     LIMIT 1;
    
    -- Si no hay owner, obtener cualquier usuario de la empresa (fallback)
    IF v_created_by IS NULL THEN
      SELECT id INTO v_created_by 
        FROM public.users 
       WHERE company_id = v_quote.company_id 
       LIMIT 1;
    END IF;
  ELSE
    v_created_by := v_quote.created_by;
  END IF;

  -- ==============================================================
  -- IMPORTANTE: status = 'draft' (NO 'finalized' que NO existe)
  -- ==============================================================
  INSERT INTO public.invoices (
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
    status,           -- ← AQUÍ ES DONDE VA 'draft'
    notes,
    rectifies_invoice_id,
    rectification_reason,
    created_by,
    source_quote_id,
    recurrence_period
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
    'draft',          -- ← VALOR CORRECTO: 'draft' (no 'finalized')
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
      v_item.line_number,
      v_item.description,
      v_item.quantity,
      v_item.unit_price,
      coalesce(v_item.discount_percent, 0),
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
$func$;

-- PASO 5: Verificar que la función se creó correctamente
SELECT 
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'convert_quote_to_invoice'
AND n.nspname = 'public';

-- PASO 6: Ver el código de la función para confirmar que tiene 'draft'
SELECT prosrc 
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'convert_quote_to_invoice'
AND n.nspname = 'public';

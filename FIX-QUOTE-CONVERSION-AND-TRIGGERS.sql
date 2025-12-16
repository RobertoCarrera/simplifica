-- ============================================================================
-- COMPREHENSIVE FIX: Quote Conversion & Triggers
-- ============================================================================

-- FIX 1: Update invoices_immutability_guard to use VALID enum values
-- The previous version checked for 'finalized'/'official' which DO NOT EXIST in invoice_status enum.
-- Valid values are: draft, sent, paid, partial, overdue, cancelled, void, approved, issued, rectified

CREATE OR REPLACE FUNCTION public.invoices_immutability_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  old_values JSONB;
  new_values JSONB;
  diff_keys TEXT[];
  base_allowed_fields TEXT[] := ARRAY[
    'payment_status',
    'notes_internal', 
    'payment_method',
    'payment_reference',
    'paid_at',
    'due_date',
    'updated_at',
    -- Payment link fields
    'stripe_payment_url',
    'stripe_payment_token',
    'paypal_payment_url',
    'paypal_payment_token',
    'payment_link_token',
    'payment_link_provider',
    'payment_link_expires_at',
    -- Generated columns (appear as NULL in BEFORE triggers)
    'retention_until',
    'full_invoice_number'
  ];
  allowed_fields TEXT[];
BEGIN
  -- Only block updates if invoice is in a final state (issued, sent, paid, etc.)
  -- IGNORE: draft, approved (assuming approved matches 'accepted' quote but not yet issued?)
  IF OLD.status NOT IN ('issued', 'sent', 'paid', 'partial', 'overdue', 'rectified', 'void', 'cancelled') THEN
    RETURN NEW;
  END IF;

  allowed_fields := base_allowed_fields;
  
  -- Allow rectification changes
  IF NEW.status IN ('rectified', 'void') THEN
    allowed_fields := allowed_fields || ARRAY['status', 'rectification_invoice_id', 'rectification_reason', 'rectification_type', 'rectified_at'];
  END IF;
  
  old_values := to_jsonb(OLD);
  new_values := to_jsonb(NEW);
  
  FOR i IN 1..array_length(allowed_fields, 1) LOOP
    old_values := old_values - allowed_fields[i];
    new_values := new_values - allowed_fields[i];
  END LOOP;
  
  SELECT array_agg(key) INTO diff_keys
  FROM (
    SELECT key FROM jsonb_each(new_values) 
    EXCEPT 
    SELECT key FROM jsonb_each(old_values) WHERE old_values->key = new_values->key
  ) AS diffs;
  
  IF diff_keys IS NOT NULL AND array_length(diff_keys, 1) > 0 THEN
    FOR i IN 1..array_length(diff_keys, 1) LOOP
      IF new_values->diff_keys[i] IS DISTINCT FROM old_values->diff_keys[i] THEN
        RAISE EXCEPTION 'Invoice is in final state (%) and immutable. Diff: New=% Old=%', 
          OLD.status, new_values, old_values
        USING HINT = 'Allowed: ' || array_to_string(allowed_fields, ', ');
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- FIX 2: Re-apply convert_quote_to_invoice with Correct Owner Lookup
-- Ensuring we use 'draft' status and lookup owner in public.users

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(
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
    -- Intentar obtener el owner de la empresa (Role based lookup)
    SELECT id INTO v_created_by 
      FROM public.users 
     WHERE company_id = v_quote.company_id 
       AND role = 'owner'
     LIMIT 1;
    
    -- Fallback: cualquier usuario de la empresa
    IF v_created_by IS NULL THEN
      SELECT id INTO v_created_by 
        FROM public.users 
       WHERE company_id = v_quote.company_id 
       LIMIT 1;
    END IF;
  ELSE
    v_created_by := v_quote.created_by;
  END IF;

  -- INSERT using 'draft' status
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
    status,           -- 'draft'
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
    'draft',          
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

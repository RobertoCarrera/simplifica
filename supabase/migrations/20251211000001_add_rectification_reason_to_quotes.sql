-- Añadir campo rectification_reason a quotes y actualizar función create_rectification_quote
-- para aceptar y guardar el motivo de rectificación

BEGIN;

-- 1. Añadir campo rectification_reason a quotes (si no existe)
ALTER TABLE public.quotes 
ADD COLUMN IF NOT EXISTS rectification_reason TEXT;

-- 2. Actualizar la función create_rectification_quote para aceptar el motivo
CREATE OR REPLACE FUNCTION public.create_rectification_quote(
  p_invoice_id UUID,
  p_rectification_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_invoice RECORD;
  v_quote_id UUID;
  v_item RECORD;
  v_quote_number TEXT;
  v_sequence_number INTEGER;
  v_year INTEGER;
  v_company_id UUID;
  v_line_number INTEGER := 0;
BEGIN
  -- 1. Obtener datos de la factura original
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  v_company_id := v_invoice.company_id;

  -- 2. Calcular nuevo número de presupuesto
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_sequence_number
  FROM public.quotes
  WHERE company_id = v_company_id 
    AND year = v_year;
  
  v_quote_number := v_year || '-P-' || LPAD(v_sequence_number::TEXT, 5, '0');

  -- 3. Crear el presupuesto rectificativo (con valores negativos)
  INSERT INTO public.quotes (
    company_id,
    client_id,
    quote_number,
    year,
    sequence_number,
    quote_date,
    valid_until,
    status,
    title,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    notes,
    rectifies_invoice_id,
    rectification_reason,
    created_by
  ) VALUES (
    v_company_id,
    v_invoice.client_id,
    v_quote_number,
    v_year,
    v_sequence_number,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    'accepted',  -- Estado aceptado para poder convertirlo a factura
    'Rectificación de factura ' || v_invoice.full_invoice_number,
    v_invoice.subtotal * -1,
    v_invoice.tax_amount * -1,
    v_invoice.total * -1,
    v_invoice.currency,
    COALESCE(
      'Rectificación de la factura ' || v_invoice.full_invoice_number || '. Motivo: ' || p_rectification_reason,
      'Rectificación de la factura ' || v_invoice.full_invoice_number
    ),
    p_invoice_id,
    p_rectification_reason,
    auth.uid()
  ) RETURNING id INTO v_quote_id;

  -- 4. Copiar líneas de factura (con valores negativos)
  -- NOTA: invoice_items usa "line_order", quote_items usa "line_number"
  v_line_number := 0;
  FOR v_item IN 
    SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id ORDER BY line_order
  LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO public.quote_items (
      company_id,
      quote_id,
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
      v_company_id,
      v_quote_id,
      v_line_number,
      v_item.description,
      v_item.quantity * -1,
      v_item.unit_price,
      v_item.discount_percent,
      v_item.tax_rate,
      v_item.tax_amount * -1,
      v_item.subtotal * -1,
      v_item.total * -1
    );
  END LOOP;

  -- 5. Actualizar estado de la factura original a 'rectified'
  UPDATE public.invoices 
  SET status = 'rectified',
      updated_at = NOW()
  WHERE id = p_invoice_id;

  RETURN v_quote_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Asegurar que al convertir quote a invoice, se pase el rectification_reason
-- Esto ya debería estar en la lógica de conversión, pero lo documentamos aquí

COMMENT ON COLUMN public.quotes.rectification_reason IS 
'Motivo de rectificación cuando el presupuesto es una rectificativa de una factura. Se copia a la factura resultante.';

COMMIT;

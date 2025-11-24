-- Corregir el formato del número de presupuesto en create_rectification_quote
-- Anteriormente generaba P2025-XXXX, ahora generará 2025-P-XXXXX para coincidir con el formato estándar

CREATE OR REPLACE FUNCTION public.create_rectification_quote(p_invoice_id UUID)
RETURNS UUID AS $$
DECLARE
  v_invoice RECORD;
  v_quote_id UUID;
  v_item RECORD;
  v_quote_number TEXT;
  v_sequence_number INTEGER;
  v_year INTEGER;
BEGIN
  -- 1. Obtener datos de la factura original
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  -- 2. Calcular nuevo número de presupuesto (para la rectificativa)
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_sequence_number
  FROM public.quotes
  WHERE company_id = v_invoice.company_id AND year = v_year;
  
  -- CORRECCIÓN: Formato estándar YYYY-P-XXXXX (5 dígitos)
  v_quote_number := v_year || '-P-' || LPAD(v_sequence_number::TEXT, 5, '0');

  -- 3. Crear el presupuesto de rectificación
  INSERT INTO public.quotes (
    company_id,
    client_id,
    quote_number,
    sequence_number,
    year,
    quote_date,
    valid_until,
    status,
    title,
    subtotal,
    tax_amount,
    total_amount,
    notes,
    created_by
  ) VALUES (
    v_invoice.company_id,
    v_invoice.client_id,
    v_quote_number,
    v_sequence_number,
    v_year,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    'draft', -- Se crea en borrador para revisión
    'Rectificación de factura ' || coalesce(v_invoice.full_invoice_number, v_invoice.invoice_series || '-' || v_invoice.invoice_number),
    v_invoice.subtotal * -1, -- Importes negativos por defecto para rectificativa
    v_invoice.tax_amount * -1,
    v_invoice.total * -1,
    'Rectificación de la factura ' || coalesce(v_invoice.full_invoice_number, v_invoice.invoice_series || '-' || v_invoice.invoice_number) || '. Motivo: ',
    auth.uid()
  ) RETURNING id INTO v_quote_id;

  -- 4. Copiar líneas de la factura al presupuesto (con importes negativos)
  FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
    INSERT INTO public.quote_items (
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
      v_invoice.company_id,
      v_item.line_order,
      v_item.description,
      v_item.quantity * -1, -- Cantidad negativa para rectificación
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

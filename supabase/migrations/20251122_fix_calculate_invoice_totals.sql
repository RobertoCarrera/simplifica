-- Fix calculate_invoice_totals to respect new statuses
CREATE OR REPLACE FUNCTION calculate_invoice_totals(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_subtotal NUMERIC(12,2);
  v_tax_amount NUMERIC(12,2);
  v_total NUMERIC(12,2);
  v_paid_amount NUMERIC(12,2);
  v_new_status invoice_status;
  v_due_date DATE;
BEGIN
  -- Calcular totales desde las líneas
  SELECT 
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(total), 0)
  INTO v_subtotal, v_tax_amount, v_total
  FROM invoice_items
  WHERE invoice_id = p_invoice_id;
  
  -- Calcular total pagado
  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid_amount
  FROM invoice_payments
  WHERE invoice_id = p_invoice_id;
  
  -- Obtener estado actual y fecha vencimiento
  SELECT status, due_date INTO v_new_status, v_due_date 
  FROM invoices WHERE id = p_invoice_id;
  
  -- Lógica de estados
  IF v_paid_amount >= v_total AND v_total > 0 THEN
    v_new_status := 'paid';
  ELSIF v_paid_amount > 0 AND v_paid_amount < v_total THEN
    v_new_status := 'partial';
  ELSIF v_new_status = 'draft' THEN
    v_new_status := 'draft';
  ELSIF v_due_date < CURRENT_DATE AND v_new_status NOT IN ('cancelled', 'rectified', 'paid') THEN
    v_new_status := 'overdue';
  ELSE
    -- Si no es pagada, ni parcial, ni borrador, ni vencida...
    -- Mantener estados especiales si ya los tiene
    IF v_new_status IN ('approved', 'issued', 'rectified', 'sent', 'cancelled') THEN
       -- Mantener el estado actual
       v_new_status := v_new_status;
    ELSE
       -- Si venía de 'paid', 'partial' u 'overdue' y ya no lo es,
       -- por defecto la pasamos a 'sent' (o 'approved' si preferimos, pero 'sent' es más seguro para cobro)
       -- En este caso, si acabamos de crearla como 'approved', entrará en el IF anterior y se mantendrá.
       v_new_status := 'sent';
    END IF;
  END IF;
  
  -- Actualizar factura
  UPDATE invoices
  SET 
    subtotal = v_subtotal,
    tax_amount = v_tax_amount,
    total = v_total,
    paid_amount = v_paid_amount,
    status = v_new_status,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

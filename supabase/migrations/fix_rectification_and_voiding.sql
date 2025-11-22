BEGIN;

-- 1. Fix create_rectification_quote
CREATE OR REPLACE FUNCTION public.create_rectification_quote(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_quote_id uuid;
  v_item record;
  v_year integer;
  v_sequence integer;
  v_quote_number text;
BEGIN
  -- Load invoice
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- Get next quote number
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  SELECT public.get_next_quote_number(v_invoice.company_id, v_year) INTO v_sequence;
  v_quote_number := v_year || '-P-' || LPAD(v_sequence::TEXT, 5, '0');

  -- Create Quote
  INSERT INTO public.quotes (
    company_id,
    client_id,
    quote_number,
    year,
    sequence_number,
    quote_date,
    valid_until,
    status,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    notes,
    rectifies_invoice_id,
    created_by
  ) VALUES (
    v_invoice.company_id,
    v_invoice.client_id,
    v_quote_number,
    v_year,
    v_sequence,
    current_date,
    current_date + interval '30 days',
    'draft',
    v_invoice.subtotal,
    v_invoice.tax_amount,
    v_invoice.total,
    v_invoice.currency,
    'Rectificación de factura ' || coalesce(v_invoice.invoice_series, '') || '-' || coalesce(v_invoice.invoice_number, ''),
    p_invoice_id,
    auth.uid()
  ) RETURNING id INTO v_quote_id;

  -- Copy items
  FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id ORDER BY line_order LOOP
    INSERT INTO public.quote_items (
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
      v_quote_id,
      v_item.line_order,
      v_item.description,
      v_item.quantity,
      v_item.unit_price,
      v_item.discount_percent,
      v_item.tax_rate,
      v_item.tax_amount,
      v_item.subtotal,
      v_item.total
    );
  END LOOP;

  RETURN v_quote_id;
END;
$$;

-- 2. Trigger to void invoice when cancellation is accepted
CREATE OR REPLACE FUNCTION public.handle_verifactu_voiding()
RETURNS TRIGGER AS $$
BEGIN
  -- If an anulacion event is accepted, mark the invoice as void
  IF NEW.event_type = 'anulacion' AND NEW.status = 'accepted' THEN
    UPDATE public.invoices
       SET status = 'void',
           state = 'void'
     WHERE id = NEW.invoice_id
       AND (status != 'void' OR state != 'void');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_verifactu_voiding ON verifactu.events;
CREATE TRIGGER trg_verifactu_voiding
  AFTER INSERT OR UPDATE ON verifactu.events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_verifactu_voiding();

COMMIT;

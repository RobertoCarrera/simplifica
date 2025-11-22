BEGIN;

-- 1. Add rectifies_invoice_id to quotes
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS rectifies_invoice_id uuid REFERENCES public.invoices(id);

-- 2. Create create_rectification_quote RPC
CREATE OR REPLACE FUNCTION public.create_rectification_quote(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_quote_id uuid;
  v_item record;
BEGIN
  -- Load invoice
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- Create Quote
  INSERT INTO public.quotes (
    company_id,
    client_id,
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

-- 3. Update convert_quote_to_invoice
CREATE OR REPLACE FUNCTION convert_quote_to_invoice(
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
  v_invoice_type text := 'normal';
BEGIN
  -- Load quote
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  -- Validate state
  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Solo se pueden convertir presupuestos aceptados';
  END IF;
  IF v_quote.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este presupuesto ya fue convertido a factura';
  END IF;

  -- Determine type
  IF v_quote.rectifies_invoice_id IS NOT NULL THEN
    v_invoice_type := 'rectificative';
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

  SELECT (year::text || '-' || series_code) INTO v_series_label FROM public.invoice_series WHERE id = v_series_id;
  SELECT get_next_invoice_number(v_series_id) INTO v_invoice_number;

  -- Insert invoice
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
    status,
    notes,
    rectifies_invoice_id,
    created_by
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
    'Generada desde presupuesto: ' || v_quote.full_quote_number || coalesce(E'\n\n' || v_quote.notes, ''),
    v_quote.rectifies_invoice_id,
    v_quote.created_by
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
      COALESCE(v_item.discount_percent, 0),
      v_item.tax_rate,
      v_item.tax_amount,
      v_item.subtotal,
      v_item.total
    );
  END LOOP;

  PERFORM public.calculate_invoice_totals(v_invoice_id);

  UPDATE public.quotes
     SET invoice_id = v_invoice_id,
         status = 'invoiced',
         invoiced_at = now(),
         updated_at = now()
   WHERE id = p_quote_id;

  RETURN v_invoice_id;
END;
$$;

-- 4. Update finalize_invoice (VeriFactu payload)
CREATE OR REPLACE FUNCTION public.finalize_invoice(p_invoice_id uuid, p_series text, p_device_id text default null, p_software_id text default null)
RETURNS json
VOLATILE
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
  v_user uuid := auth.uid();
  v_number bigint;
  v_prev text;
  v_payload jsonb;
  v_hash text;
  v_vat jsonb;
  v_qr text;
  v_invoice_type text;
  v_rectifies_id uuid;
  v_rectified_series text;
  v_rectified_number text;
  v_rectified_date date;
BEGIN
  SELECT company_id, invoice_type, rectifies_invoice_id 
    INTO v_company_id, v_invoice_type, v_rectifies_id 
    FROM public.invoices WHERE id = p_invoice_id;
    
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found or missing company_id', p_invoice_id;
  END IF;

  -- Get sequential number & previous hash
  SELECT number, previous_hash INTO v_number, v_prev FROM verifactu.get_next_invoice_number(v_company_id, p_series);

  -- VAT breakdown
  BEGIN
    v_vat := verifactu.compute_vat_breakdown(p_invoice_id);
  EXCEPTION WHEN undefined_function THEN
    v_vat := '[]'::jsonb;
  END;

  -- Canonical payload for hash
  v_payload := jsonb_build_object(
    'invoice_id', p_invoice_id,
    'company_id', v_company_id,
    'series', p_series,
    'number', v_number,
    'currency', (SELECT currency FROM public.invoices WHERE id=p_invoice_id),
    'totals', jsonb_build_object(
      'base', (SELECT total_tax_base FROM public.invoices WHERE id=p_invoice_id),
      'vat', (SELECT total_vat FROM public.invoices WHERE id=p_invoice_id),
      'gross', (SELECT total_gross FROM public.invoices WHERE id=p_invoice_id)
    ),
    'vat_breakdown', COALESCE(v_vat, '[]'::jsonb)
  );

  -- Add Rectification details if applicable
  IF v_invoice_type = 'rectificative' AND v_rectifies_id IS NOT NULL THEN
    -- Fetch rectified invoice details
    SELECT series, number::text, issue_time::date 
      INTO v_rectified_series, v_rectified_number, v_rectified_date
      FROM verifactu.invoice_meta 
     WHERE invoice_id = v_rectifies_id;
     
    -- Fallback to invoices table if not in meta
    IF v_rectified_series IS NULL THEN
       SELECT invoice_series, invoice_number, invoice_date 
         INTO v_rectified_series, v_rectified_number, v_rectified_date
         FROM public.invoices WHERE id = v_rectifies_id;
    END IF;

    v_payload := v_payload || jsonb_build_object(
      'invoice_type', 'R',
      'rectified_invoice', jsonb_build_object(
        'series', v_rectified_series,
        'number', v_rectified_number,
        'issue_date', v_rectified_date
      ),
      'rectification_type', 'S'
    );
  END IF;

  v_hash := verifactu.compute_invoice_hash(v_payload, v_prev);
  v_qr := 'SERIE:'||p_series||'|NUM:'||v_number||'|HASH:'||v_hash;

  -- Persist meta
  INSERT INTO verifactu.invoice_meta(invoice_id, company_id, series, number, chained_hash, previous_hash, device_id, software_id, qr_payload, status, created_by)
  VALUES (p_invoice_id, v_company_id, p_series, v_number, v_hash, v_prev, p_device_id, p_software_id, v_qr, 'pending', v_user)
  ON CONFLICT (invoice_id) DO UPDATE
    SET chained_hash = excluded.chained_hash,
        previous_hash = excluded.previous_hash,
        series = excluded.series,
        number = excluded.number,
        device_id = excluded.device_id,
        software_id = excluded.software_id,
        qr_payload = excluded.qr_payload,
        status = 'pending';

  -- Mark invoice as final
  UPDATE public.invoices
     SET state='final',
         finalized_at = COALESCE(finalized_at, now()),
         canonical_payload = v_payload,
         hash_prev = v_prev,
         hash_current = v_hash
   WHERE id=p_invoice_id;

  -- Advance sequence
  UPDATE verifactu.invoice_sequence
     SET last_hash = v_hash,
         updated_at = now()
   WHERE company_id=v_company_id AND series=p_series;

  -- Enqueue event
  INSERT INTO verifactu.events(company_id, invoice_id, event_type, payload)
  VALUES (v_company_id, p_invoice_id, 'alta', v_payload)
  ON CONFLICT (invoice_id, event_type) DO NOTHING;

  RETURN json_build_object('invoice_id', p_invoice_id, 'series', p_series, 'number', v_number, 'hash', v_hash, 'qr', v_qr, 'vat_breakdown', COALESCE(v_vat, '[]'::jsonb));
END;
$$;

COMMIT;

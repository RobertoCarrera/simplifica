-- Fix/align convert_quote_to_invoice to current invoices schema
-- Date: 2025-11-03

begin;

-- Replace convert function to match invoices + invoice_items structure and numbering
create or replace function convert_quote_to_invoice(
  p_quote_id uuid,
  p_invoice_series_id uuid default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_quote public.quotes%rowtype;
  v_invoice_id uuid;
  v_series_id uuid;
  v_series_label text;
  v_invoice_number text;
  v_item record;
begin
  -- Load quote
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    raise exception 'Quote % not found', p_quote_id;
  end if;

  -- Validate state
  if v_quote.status <> 'accepted' then
    raise exception 'Solo se pueden convertir presupuestos aceptados';
  end if;
  if v_quote.invoice_id is not null then
    raise exception 'Este presupuesto ya fue convertido a factura';
  end if;

  -- Resolve series to use
  if p_invoice_series_id is null then
    select id into v_series_id
      from public.invoice_series
     where company_id = v_quote.company_id
       and is_active = true
       and is_default = true
     order by year desc
     limit 1;
  else
    v_series_id := p_invoice_series_id;
  end if;
  if v_series_id is null then
    raise exception 'No hay serie de factura por defecto configurada';
  end if;

  -- Build series label (e.g., '2025-A') and get next number (e.g., '00001')
  select (year::text || '-' || series_code) into v_series_label from public.invoice_series where id = v_series_id;
  select get_next_invoice_number(v_series_id) into v_invoice_number; -- existing helper returns padded TEXT

  -- Insert invoice
  insert into public.invoices (
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
    created_by
  ) values (
    v_quote.company_id,
    v_quote.client_id,
    v_series_id,
    v_invoice_number,
    v_series_label,
    'normal',
    current_date,
    current_date + interval '30 days',
    v_quote.subtotal,
    v_quote.tax_amount,
    v_quote.total_amount,
    v_quote.currency,
    'draft',
    'Generada desde presupuesto: ' || v_quote.full_quote_number || coalesce(E'\n\n' || v_quote.notes, ''),
    v_quote.created_by
  ) returning id into v_invoice_id;

  -- Copy items
  for v_item in
    select * from public.quote_items where quote_id = p_quote_id order by line_number
  loop
    insert into public.invoice_items (
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
    ) values (
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
  end loop;

  -- Recalculate totals to be safe
  perform public.calculate_invoice_totals(v_invoice_id);

  -- Update quote linkage
  update public.quotes
     set invoice_id = v_invoice_id,
         status = 'invoiced',
         invoiced_at = now(),
         updated_at = now()
   where id = p_quote_id;

  return v_invoice_id;
end
$$;

commit;

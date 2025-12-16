-- Debug and fix convert_quote_to_invoice function
-- Run this in Supabase SQL Editor

-- Step 1: Check if the function exists and its definition
SELECT pg_get_functiondef(oid) as function_def 
FROM pg_proc 
WHERE proname = 'convert_quote_to_invoice';

-- Step 2: Test the function with the failing quote
-- SELECT * FROM public.quotes WHERE id = 'f25d1276-e421-4b7f-ae31-eba083dcfd9e';

-- Step 3: Check if invoices table has the required columns
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'invoices'
AND column_name IN ('source_quote_id', 'recurrence_period')
ORDER BY column_name;

-- Step 4: Update the function to support recurring invoices properly
-- FIX: Handle case where created_by is a client (not in users table)
CREATE OR REPLACE FUNCTION convert_quote_to_invoice(
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
  v_invoice_type invoice_type;
  v_recurrence_period text;
  v_is_recurring boolean;
  v_created_by uuid;
begin
  -- Load quote
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    raise exception 'Quote % not found', p_quote_id;
  end if;

  -- Validate state - accept 'accepted' status for conversion
  if v_quote.status <> 'accepted' and v_quote.status <> 'invoiced' then
    raise exception 'Solo se pueden convertir presupuestos aceptados';
  end if;
  if v_quote.invoice_id is not null then
    raise exception 'Este presupuesto ya fue convertido a factura';
  end if;

  -- Determinar el tipo de factura
  if v_quote.rectifies_invoice_id is not null OR (v_quote.total_amount < 0) then
    v_invoice_type := 'rectificative'::invoice_type;
  else
    v_invoice_type := 'normal'::invoice_type;
  end if;

  -- Determine if this is a recurring quote
  v_is_recurring := v_quote.recurrence_type IS NOT NULL AND v_quote.recurrence_type <> 'none';
  
  -- Calculate recurrence_period (YYYY-MM format) for recurring invoices
  if v_is_recurring then
    v_recurrence_period := to_char(current_date, 'YYYY-MM');
  else
    v_recurrence_period := null;
  end if;

  -- Resolve created_by: use quote's created_by if it exists in users table,
  -- otherwise find the company owner (for quotes created by clients via portal)
  v_created_by := null;
  
  if v_quote.created_by is not null then
    select id into v_created_by 
    from public.users 
    where id = v_quote.created_by;
  end if;
  
  if v_created_by is null then
    -- Quote was created by a client or has no created_by, find company owner
    select id into v_created_by
    from public.users
    where company_id = v_quote.company_id
      and role = 'owner'
      and active = true
    limit 1;
    
    -- If no owner found, get any active user from the company
    if v_created_by is null then
      select id into v_created_by
      from public.users
      where company_id = v_quote.company_id
        and active = true
      limit 1;
    end if;
  end if;
  
  -- If still no user found, raise error
  if v_created_by is null then
    raise exception 'No se encontró ningún usuario activo en la empresa para asignar la factura';
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

  -- Build series label and get next number
  select (year::text || '-' || series_code) into v_series_label from public.invoice_series where id = v_series_id;
  select get_next_invoice_number(v_series_id) into v_invoice_number;

  -- Insert invoice with recurrence fields
  -- Note: full_invoice_number is a GENERATED column, so we don't insert it directly
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
    rectifies_invoice_id,
    rectification_reason,
    created_by,
    source_quote_id,
    recurrence_period
  ) values (
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
    'Generada desde presupuesto: ' || coalesce(v_quote.full_quote_number, v_quote.quote_number) || coalesce(E'\n\n' || v_quote.notes, ''),
    v_quote.rectifies_invoice_id,
    v_quote.rectification_reason,
    v_created_by,  -- Use resolved created_by (owner if quote was created by client)
    CASE WHEN v_is_recurring THEN p_quote_id ELSE null END,
    v_recurrence_period
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

  -- Update quote linkage
  update public.quotes
     set invoice_id = v_invoice_id,
         status = 'invoiced',
         invoiced_at = now(),
         updated_at = now(),
         last_run_at = CASE WHEN v_is_recurring THEN now() ELSE last_run_at END
   where id = p_quote_id;

  return v_invoice_id;
end
$$;

COMMENT ON FUNCTION convert_quote_to_invoice IS 
'Convierte un presupuesto aceptado en factura. Para presupuestos recurrentes, establece source_quote_id y recurrence_period. Si el presupuesto fue creado por un cliente del portal, usa el owner de la empresa como created_by.';

-- Step 5: Diagnostic - Check what users exist for the company
-- Run this first to see the available users
SELECT id, auth_user_id, email, role, active, company_id
FROM public.users
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';

-- Step 5b: Check quotes with invalid created_by
SELECT q.id, q.created_by, q.company_id, q.status
FROM public.quotes q
WHERE q.created_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = q.created_by);

-- Step 5c: Fix quotes - SET created_by to NULL for quotes created by portal clients
-- This allows the function to handle it properly
UPDATE public.quotes q
SET created_by = NULL
WHERE q.created_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = q.created_by);

-- Step 6: Test converting the specific quote after function update
-- SELECT convert_quote_to_invoice('761a4f70-69c0-4bfe-8db4-67398b64f83b');

-- Step 7: Verify the invoice was created (after running step 6)
-- SELECT id, invoice_number, source_quote_id, recurrence_period 
-- FROM public.invoices 
-- WHERE source_quote_id = '761a4f70-69c0-4bfe-8db4-67398b64f83b';

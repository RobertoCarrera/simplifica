-- ========================================================
-- FIX COMPLETO: Función convert_quote_to_invoice + Trigger inmutabilidad
-- ========================================================
-- EJECUTAR EN EL SQL EDITOR DE SUPABASE
-- ========================================================

-- PRIMERO: Verificar y mostrar el estado actual
DO $$ BEGIN
  RAISE NOTICE '=== DIAGNÓSTICO ===';
END $$;

-- Ver valores válidos del enum invoice_status
SELECT 'VALORES ENUM invoice_status:' AS info, 
       string_agg(enumlabel, ', ' ORDER BY enumsortorder) AS valores
FROM pg_enum 
WHERE enumtypid = 'public.invoice_status'::regtype;

-- Ver el DEFAULT de la columna status
SELECT 'DEFAULT columna status:' AS info, 
       column_default AS valor
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'invoices' 
  AND column_name = 'status';

-- ELIMINAR versiones anteriores de la función
DROP FUNCTION IF EXISTS convert_quote_to_invoice(uuid);
DROP FUNCTION IF EXISTS convert_quote_to_invoice(uuid, uuid);
DROP FUNCTION IF EXISTS public.convert_quote_to_invoice(uuid);
DROP FUNCTION IF EXISTS public.convert_quote_to_invoice(uuid, uuid);
-- Eliminar por OID cualquier versión
DO $$ 
DECLARE
  func_oid oid;
BEGIN
  FOR func_oid IN 
    SELECT p.oid 
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE p.proname = 'convert_quote_to_invoice' 
      AND n.nspname = 'public'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_oid::regprocedure;
  END LOOP;
END $$;

-- ========================================================
-- PARTE 1: Función convert_quote_to_invoice
-- ========================================================
-- El status de facturas válido es: draft, sent, paid, partial, overdue, cancelled
-- NO existe 'finalized' en el enum invoice_status

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

  -- Determine created_by: use quote's created_by if it exists in users table, 
  -- otherwise use company owner or first company user
  SELECT id INTO v_created_by 
  FROM public.users 
  WHERE id = v_quote.created_by;
  
  IF v_created_by IS NULL THEN
    -- Fallback to owner or any user from the same company
    SELECT id INTO v_created_by
    FROM public.users
    WHERE company_id = v_quote.company_id
    ORDER BY role = 'owner' DESC, created_at ASC
    LIMIT 1;
  END IF;
  
  IF v_created_by IS NULL THEN
    raise exception 'No valid user found to create invoice for company %', v_quote.company_id;
  END IF;

  -- Insert invoice with status = 'draft' (valid enum value)
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
    'draft',  -- IMPORTANTE: 'draft' es el valor correcto, NO 'finalized'
    'Generada desde presupuesto: ' || coalesce(v_quote.full_quote_number, v_quote.quote_number) || coalesce(E'\n\n' || v_quote.notes, ''),
    v_quote.rectifies_invoice_id,
    v_quote.rectification_reason,
    v_created_by,  -- Use validated user ID, not quote's created_by
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

-- ========================================================
-- PARTE 2: Trigger de inmutabilidad
-- ========================================================
-- Permite actualizar campos de pago en facturas finalizadas

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
  -- Only block updates if invoice is finalized
  IF OLD.status NOT IN ('finalized', 'official') THEN
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
        RAISE EXCEPTION 'Invoice is finalized and immutable. Diff: New=% Old=%', 
          new_values, old_values
        USING HINT = 'Allowed: ' || array_to_string(allowed_fields, ', ');
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- ========================================================
-- VERIFICACIÓN
-- ========================================================
-- Verificar que la función tiene 'draft'
SELECT 'VERIFICACIÓN - Función contiene draft:' AS info,
       pg_get_functiondef(oid) LIKE '%draft%' AS contiene_draft,
       pg_get_functiondef(oid) LIKE '%finalized%' AS contiene_finalized_MAL
FROM pg_proc 
WHERE proname = 'convert_quote_to_invoice' 
LIMIT 1;

-- Listar triggers en invoices
SELECT 'TRIGGERS en invoices:' AS info, 
       string_agg(tgname, ', ') AS triggers
FROM pg_trigger 
WHERE tgrelid = 'public.invoices'::regclass AND NOT tgisinternal;

SELECT 'FIX APLICADO CORRECTAMENTE' AS resultado;

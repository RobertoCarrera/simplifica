-- Safe replacement for validate_invoice_before_issue
-- Ensures invoice row is checked before accessing fields to avoid
-- "record \"i\" is not assigned yet" errors.

begin;

-- If an existing function with a different return type exists, drop it first
drop function if exists public.validate_invoice_before_issue(uuid);

create function public.validate_invoice_before_issue(pinvoiceid uuid)
returns json
volatile
language plpgsql
as $$
declare
  i public.invoices%rowtype;
  errs text[] := ARRAY[]::text[];
begin
  -- Try load invoice; if missing return a clear validation error
  select * into i from public.invoices where id = pinvoiceid;
  if not found then
    return json_build_object('valid', false, 'errors', array['Invoice not found or inaccessible']);
  end if;

  -- Basic validations (extend as needed)
  if i.state is not null and lower(coalesce(i.state,'')) in ('final','void','anulada','cancelled') then
    errs := errs || 'Invoice already finalized/void';
  end if;

  if i.total is null or i.total <= 0 then
    errs := errs || 'Total amount missing or invalid';
  end if;

  if i.company_id is null then
    errs := errs || 'Missing company_id on invoice';
  end if;

  -- Verify referenced series exists (best-effort)
  if i.series_id is not null then
    if not exists (select 1 from public.invoice_series where id = i.series_id) then
      errs := errs || 'Invoice series not found';
    end if;
  else
    errs := errs || 'Missing invoice series reference';
  end if;

  if array_length(errs,1) is null then
    return json_build_object('valid', true, 'errors', ARRAY[]::text[]);
  else
    return json_build_object('valid', false, 'errors', errs);
  end if;
end;
$$;

commit;

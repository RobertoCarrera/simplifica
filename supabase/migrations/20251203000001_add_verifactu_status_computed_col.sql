create or replace function public.verifactu_status(i public.invoices)
returns text
language sql
stable
security definer
as $$
  select status from verifactu.invoice_meta where invoice_id = i.id;
$$;

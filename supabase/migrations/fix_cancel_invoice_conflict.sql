create or replace function public.cancel_invoice(p_invoice_id uuid, p_reason text default null)
returns json
volatile
language plpgsql
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.invoices where id=p_invoice_id;
  if v_company_id is null then raise exception 'Invoice not found'; end if;
  
  -- Update state to void (triggers handle_invoice_verifactu if configured)
  update public.invoices set state='void' where id=p_invoice_id and state <> 'void';
  
  -- Insert or update anulacion event (idempotent)
  insert into verifactu.events(company_id, invoice_id, event_type, payload)
  values (v_company_id, p_invoice_id, 'anulacion', jsonb_build_object('reason', coalesce(p_reason,'n/a')))
  on conflict (invoice_id, event_type) do update
  set payload = excluded.payload,
      status = 'pending'; -- Reset status to pending if we are re-requesting cancellation
  
  -- Update meta status
  update verifactu.invoice_meta set status='void' where invoice_id=p_invoice_id;
  
  return json_build_object('status','void');
end$$;

-- 1. Update immutability guard to allow voiding
create or replace function public.invoices_immutability_guard()
returns trigger
language plpgsql
as $$
declare
  allowed text[] := array['payment_status','notes_internal','payment_method','payment_reference','paid_at','due_date'];
begin
  -- If invoice is finalized
  if old.state = 'final' then
    -- ALLOW voiding: if status or state is changing to 'void', permit it.
    if (new.status = 'void') or (new.state = 'void') then
      return new;
    end if;

    -- Otherwise check allowed fields
    if ( (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) ) then
      raise exception 'Invoice is finalized and immutable; only limited fields are editable'
        using hint = 'Allowed: ' || array_to_string(allowed, ', ');
    end if;
  end if;
  return new;
end$$;

-- 2. Update cancel_invoice to update both status and state
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
  
  -- Update status AND state to void
  -- We update both to ensure consistency and bypass immutability guard (which now allows 'void')
  update public.invoices 
  set status='void', 
      state='void' 
  where id=p_invoice_id 
  and (status <> 'void' or state <> 'void');
  
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

-- 3. Update handle_verifactu_voiding to update both status and state
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

-- Allow changing invoice status to 'rectified' even if finalized
-- This is required for the rectification workflow

create or replace function public.invoices_immutability_guard()
returns trigger
language plpgsql
as $$
declare
  allowed text[] := array['payment_status','notes_internal','payment_method','payment_reference','paid_at','due_date'];
begin
  if old.state = 'final' then
    -- Exception: Allow changing status to 'rectified' or 'void'
    -- When rectifying or voiding an invoice, we need to update its status/state
    -- We also need to allow updated_at to change, as the RPC updates it
    -- We also need to allow generated columns (retention_until, full_invoice_number) as they appear null in BEFORE triggers
    if new.status::text IN ('rectified', 'void') then
       allowed := allowed || ARRAY['status', 'state', 'updated_at', 'retention_until', 'full_invoice_number'];
    end if;

    if ( (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) ) then
      raise exception 'Invoice is finalized and immutable. Diff: New=%, Old=%', 
        (to_jsonb(new) - allowed), (to_jsonb(old) - allowed)
        using hint = 'Allowed: ' || array_to_string(allowed, ', ');
    end if;
  end if;
  return new;
end$$;

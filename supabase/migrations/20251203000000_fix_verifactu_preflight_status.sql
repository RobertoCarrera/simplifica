-- Fix verifactu_preflight_issue to allow 'approved' status
-- This function is called by the issue-invoice Edge Function.
-- It validates the invoice status and then calls finalize_invoice.

begin;

-- Drop existing function to avoid return type conflict
drop function if exists public.verifactu_preflight_issue(uuid, text, text);

create or replace function public.verifactu_preflight_issue(
    pinvoice_id uuid,
    pdevice_id text default null,
    psoftware_id text default null
)
returns json
language plpgsql
security definer
as $$
declare
    v_invoice_status text;
    v_series text;
    v_result json;
begin
    -- Check invoice status and get series
    select i.state, s.series_code into v_invoice_status, v_series
    from public.invoices i
    join public.invoice_series s on s.id = i.series_id
    where i.id = pinvoice_id;
    
    if v_invoice_status is null then
        raise exception 'Invoice not found';
    end if;

    -- Allow 'draft' AND 'approved'
    -- The frontend expects 'invalid_status_state' if this check fails
    if v_invoice_status not in ('draft', 'approved') then
        raise exception 'invalid_status_state';
    end if;

    -- Call finalize_invoice to perform the actual work (hashing, chaining, updating status)
    -- finalize_invoice(p_invoice_id uuid, p_series text, p_device_id text, p_software_id text)
    v_result := public.finalize_invoice(pinvoice_id, v_series, pdevice_id, psoftware_id);
    
    return json_build_object('ok', true, 'data', v_result);
end;
$$;

commit;

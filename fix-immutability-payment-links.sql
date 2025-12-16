-- =============================================================================
-- FIX: Allow updating payment link fields on finalized invoices
-- =============================================================================
-- Problem: When a client contracts a service, the invoice is finalized (Verifactu)
-- BEFORE payment links are generated. The immutability trigger blocks the update.
-- 
-- Solution: Add payment link fields to the allowed list
-- 
-- Execute this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/sql/new
-- =============================================================================

create or replace function public.invoices_immutability_guard()
returns trigger
language plpgsql
as $$
declare
  allowed text[] := array[
    -- Original allowed fields
    'payment_status',
    'notes_internal',
    'payment_method',
    'payment_reference',
    'paid_at',
    'due_date',
    -- Payment link fields (NEW - needed for contract flow)
    'stripe_payment_url',
    'stripe_payment_token',
    'paypal_payment_url',
    'paypal_payment_token',
    'payment_link_token',
    'payment_link_provider',
    'payment_link_expires_at'
  ];
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

-- Verify the function was updated
SELECT 'Function updated successfully. Payment link fields are now allowed on finalized invoices.' as status;

-- VeriFactu finalize canonical payload + hash persistence and idempotent event insert
-- Safe to run multiple times

begin;

-- 1) Add finalize/canonical columns to invoices if missing
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoices' and column_name='finalized_at'
  ) then
    execute 'alter table public.invoices add column finalized_at timestamptz null';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoices' and column_name='canonical_payload'
  ) then
    execute 'alter table public.invoices add column canonical_payload jsonb null';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoices' and column_name='hash_prev'
  ) then
    execute 'alter table public.invoices add column hash_prev text null';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoices' and column_name='hash_current'
  ) then
    execute 'alter table public.invoices add column hash_current text null';
  end if;
end $$;

-- 2) Ensure idempotency on events per (invoice_id,event_type)
create unique index if not exists uq_verifactu_events_invoice_type on verifactu.events(invoice_id, event_type);

-- 3) Replace finalize function to store canonical/hash and advance sequence.last_hash
create or replace function public.finalize_invoice(p_invoice_id uuid, p_series text, p_device_id text default null, p_software_id text default null)
returns json
volatile
language plpgsql
as $$
declare
  v_company_id uuid;
  v_user uuid := auth.uid();
  v_number bigint;
  v_prev text;
  v_payload jsonb;
  v_hash text;
  v_vat jsonb;
  v_qr text;
begin
  select company_id into v_company_id from public.invoices where id = p_invoice_id;
  if v_company_id is null then
    raise exception 'Invoice % not found or missing company_id', p_invoice_id;
  end if;

  -- Get sequential number & previous hash
  select number, previous_hash into v_number, v_prev from verifactu.get_next_invoice_number(v_company_id, p_series);

  -- VAT breakdown (if helper exists)
  begin
    v_vat := verifactu.compute_vat_breakdown(p_invoice_id);
  exception when undefined_function then
    v_vat := '[]'::jsonb;
  end;

  -- Canonical payload for hash
  v_payload := jsonb_build_object(
    'invoice_id', p_invoice_id,
    'company_id', v_company_id,
    'series', p_series,
    'number', v_number,
    'currency', (select currency from public.invoices where id=p_invoice_id),
    'totals', jsonb_build_object(
      'base', (select total_tax_base from public.invoices where id=p_invoice_id),
      'vat', (select total_vat from public.invoices where id=p_invoice_id),
      'gross', (select total_gross from public.invoices where id=p_invoice_id)
    ),
    'vat_breakdown', coalesce(v_vat, '[]'::jsonb)
  );

  v_hash := verifactu.compute_invoice_hash(v_payload, v_prev);
  v_qr := 'SERIE:'||p_series||'|NUM:'||v_number||'|HASH:'||v_hash;

  -- Persist meta
  insert into verifactu.invoice_meta(invoice_id, company_id, series, number, chained_hash, previous_hash, device_id, software_id, qr_payload, status, created_by)
  values (p_invoice_id, v_company_id, p_series, v_number, v_hash, v_prev, p_device_id, p_software_id, v_qr, 'pending', v_user)
  on conflict (invoice_id) do update
    set chained_hash = excluded.chained_hash,
        previous_hash = excluded.previous_hash,
        series = excluded.series,
        number = excluded.number,
        device_id = excluded.device_id,
        software_id = excluded.software_id,
        qr_payload = excluded.qr_payload,
        status = 'pending';

  -- Mark invoice as final and store canonical/hash locally as well
  update public.invoices
     set state='final',
         finalized_at = coalesce(finalized_at, now()),
         canonical_payload = v_payload,
         hash_prev = v_prev,
         hash_current = v_hash
   where id=p_invoice_id;

  -- Advance sequence last_hash for chain integrity
  update verifactu.invoice_sequence
     set last_hash = v_hash,
         updated_at = now()
   where company_id=v_company_id and series=p_series;

  -- Enqueue event, idempotent
  insert into verifactu.events(company_id, invoice_id, event_type, payload)
  values (v_company_id, p_invoice_id, 'alta', v_payload)
  on conflict (invoice_id, event_type) do nothing;

  return json_build_object('invoice_id', p_invoice_id, 'series', p_series, 'number', v_number, 'hash', v_hash, 'qr', v_qr, 'vat_breakdown', coalesce(v_vat, '[]'::jsonb));
end$$;

commit;

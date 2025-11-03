-- VeriFactu/GDPR initialization migration
-- Safe/idempotent where possible for iterative runs

begin;

-- Needed for SHA-256
create extension if not exists pgcrypto;

-- Company claim extractor (expects JWT to carry company_id)
create or replace function public.current_company_id()
returns uuid
stable
language sql
as $$
  select nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'company_id')::uuid, null)
$$;

-- Schema for VeriFactu artifacts
create schema if not exists verifactu;

-- 1) Invoice sequence per company/series (with last hash)
create table if not exists verifactu.invoice_sequence (
  company_id uuid not null,
  series text not null,
  next_number bigint not null default 1,
  last_hash text null,
  updated_at timestamptz not null default now(),
  primary key(company_id, series)
);

-- 2) Invoice meta and chained hash data
create table if not exists verifactu.invoice_meta (
  invoice_id uuid primary key references public.invoices(id) on delete cascade,
  company_id uuid not null,
  series text not null,
  number bigint not null,
  issue_time timestamptz not null default now(),
  chained_hash text not null,
  previous_hash text null,
  device_id text null,
  software_id text null,
  qr_payload text null,
  status text not null default 'pending' check (status in ('pending','sent','accepted','rejected','void')),
  aeat_receipt jsonb null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  unique(company_id, series, number)
);
create index if not exists idx_invoice_meta_company_status on verifactu.invoice_meta(company_id, status);

-- 3) VeriFactu events queue
create table if not exists verifactu.events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  event_type text not null check (event_type in ('alta','anulacion','rectificacion','resumen')),
  payload jsonb not null,
  attempts int not null default 0,
  status text not null default 'pending' check (status in ('pending','sending','accepted','rejected')),
  last_error text null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  response jsonb null
);
create index if not exists idx_verifactu_events_company_status on verifactu.events(company_id, status);
create index if not exists idx_verifactu_events_invoice on verifactu.events(invoice_id);

-- 4) Add missing columns to invoices (safe IF NOT EXISTS)
-- Some suppliers may already have these columns; guard each alter
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoices' and column_name='state'
  ) then
    execute 'alter table public.invoices add column state text default ''draft''';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invoices' and column_name='rectifies_invoice_id'
  ) then
    execute 'alter table public.invoices add column rectifies_invoice_id uuid null references public.invoices(id)';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='total_tax_base') then
    execute 'alter table public.invoices add column total_tax_base numeric(14,2)';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='total_vat') then
    execute 'alter table public.invoices add column total_vat numeric(14,2)';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='total_gross') then
    execute 'alter table public.invoices add column total_gross numeric(14,2)';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='currency') then
    execute 'alter table public.invoices add column currency text default ''EUR''';
  end if;
end $$;

-- 5) Numbering with advisory lock
create or replace function verifactu.get_next_invoice_number(p_company_id uuid, p_series text)
returns table(number bigint, previous_hash text)
volatile
language plpgsql
as $$
declare
  lock_key bigint;
  rec verifactu.invoice_sequence;
begin
  -- lock per company/series to avoid races
  lock_key := hashtext(coalesce(p_series,'') || coalesce(p_company_id::text,''));
  perform pg_advisory_xact_lock(lock_key);

  insert into verifactu.invoice_sequence(company_id, series)
  values (p_company_id, p_series)
  on conflict(company_id, series) do nothing;

  select * into rec from verifactu.invoice_sequence where company_id=p_company_id and series=p_series for update;
  number := rec.next_number;
  previous_hash := rec.last_hash;

  update verifactu.invoice_sequence
     set next_number = rec.next_number + 1,
         updated_at = now()
   where company_id=p_company_id and series=p_series;

  return next;
end$$;

-- 6) Canonical hash helper (very simple, adjust later)
create or replace function verifactu.compute_invoice_hash(p_payload jsonb, p_previous text)
returns text
stable
language sql
as $$
  select encode(digest(coalesce(p_payload::text,'') || coalesce(p_previous,''), 'sha256'), 'hex')
$$;

-- 7) Finalize invoice (public wrapper for RPC)
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
begin
  select company_id into v_company_id from public.invoices where id = p_invoice_id;
  if v_company_id is null then
    raise exception 'Invoice % not found or missing company_id', p_invoice_id;
  end if;

  -- Get sequential number & previous hash
  select number, previous_hash into v_number, v_prev from verifactu.get_next_invoice_number(v_company_id, p_series);

  -- Minimal canonical payload (extend later with tax breakdowns)
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
    )
  );

  v_hash := verifactu.compute_invoice_hash(v_payload, v_prev);

  insert into verifactu.invoice_meta(invoice_id, company_id, series, number, chained_hash, previous_hash, device_id, software_id, status, created_by)
  values (p_invoice_id, v_company_id, p_series, v_number, v_hash, v_prev, p_device_id, p_software_id, 'pending', v_user)
  on conflict (invoice_id) do update
    set chained_hash = excluded.chained_hash,
        previous_hash = excluded.previous_hash,
        series = excluded.series,
        number = excluded.number,
        device_id = excluded.device_id,
        software_id = excluded.software_id,
        status = 'pending';

  update public.invoices set state='final' where id=p_invoice_id;

  insert into verifactu.events(company_id, invoice_id, event_type, payload)
  values (v_company_id, p_invoice_id, 'alta', v_payload);

  return json_build_object('invoice_id', p_invoice_id, 'series', p_series, 'number', v_number, 'hash', v_hash);
end$$;

-- 8) Cancel invoice (basic)
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
  update public.invoices set state='void' where id=p_invoice_id and state <> 'void';
  insert into verifactu.events(company_id, invoice_id, event_type, payload)
  values (v_company_id, p_invoice_id, 'anulacion', jsonb_build_object('reason', coalesce(p_reason,'n/a')));
  update verifactu.invoice_meta set status='void' where invoice_id=p_invoice_id;
  return json_build_object('status','void');
end$$;

-- 9) Ledger view (simplified; extend with VAT breakdown)
create or replace view verifactu.vw_ledger as
select i.company_id,
       m.series,
       m.number,
       i.issued_at as issue_time,
       i.customer_id,
       i.total_tax_base,
       i.total_vat,
       i.total_gross,
       m.chained_hash,
       m.previous_hash,
       i.state,
       m.status as send_status
  from public.invoices i
  join verifactu.invoice_meta m on m.invoice_id = i.id;

-- 10) RLS
alter table verifactu.invoice_sequence enable row level security;
alter table verifactu.invoice_meta enable row level security;
alter table verifactu.events enable row level security;

-- Policies based on JWT company_id claim
create policy if not exists seq_sel on verifactu.invoice_sequence
  for select using (company_id = public.current_company_id());
create policy if not exists seq_mod on verifactu.invoice_sequence
  for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

create policy if not exists meta_sel on verifactu.invoice_meta
  for select using (company_id = public.current_company_id());
create policy if not exists meta_mod on verifactu.invoice_meta
  for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

create policy if not exists evt_sel on verifactu.events
  for select using (company_id = public.current_company_id());
create policy if not exists evt_mod on verifactu.events
  for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

commit;

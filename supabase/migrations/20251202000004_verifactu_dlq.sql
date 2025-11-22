begin;

-- Dead Letter Queue for VeriFactu events
create table if not exists verifactu.events_dlq (
  id uuid primary key default gen_random_uuid(),
  original_event_id uuid not null references verifactu.events(id) on delete cascade,
  company_id uuid not null,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  event_type text not null check (event_type in ('alta','anulacion','rectificacion','resumen')),
  payload jsonb not null,
  attempts int not null default 0,
  last_error text null,
  response jsonb null,
  failed_at timestamptz not null default now(),
  status text not null default 'dlq' check (status in ('dlq','replayed')),
  replayed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_verifactu_events_dlq_company_status on verifactu.events_dlq(company_id, status);
create index if not exists idx_verifactu_events_dlq_invoice on verifactu.events_dlq(invoice_id);
create index if not exists idx_verifactu_events_dlq_failed_at on verifactu.events_dlq(failed_at desc);

alter table verifactu.events_dlq enable row level security;

-- Policies based on JWT company_id claim
create policy if not exists evt_dlq_sel on verifactu.events_dlq
  for select using (company_id = public.current_company_id());
create policy if not exists evt_dlq_mod on verifactu.events_dlq
  for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

commit;

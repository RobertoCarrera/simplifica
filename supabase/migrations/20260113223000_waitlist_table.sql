-- Create Waitlist Table
create type waitlist_status as enum ('pending', 'notified', 'prioritized', 'expired', 'converted');

create table public.waitlist (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.users(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status waitlist_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  constraint waitlist_pkey primary key (id)
);

-- RLS
alter table public.waitlist enable row level security;

-- Policy: Company members can view/manage waitlist
create policy "Company members can view waitlist"
  on public.waitlist for select
  using ( exists (
    select 1 from public.company_members 
    where company_members.company_id = waitlist.company_id
    and company_members.user_id = auth.uid()
  ));

create policy "Company members can manage waitlist"
  on public.waitlist for all
  using ( exists (
    select 1 from public.company_members 
    where company_members.company_id = waitlist.company_id
    and company_members.user_id = auth.uid()
  ));

-- Policy: Clients can view their own waitlist entries
create policy "Clients can view own waitlist"
  on public.waitlist for select
  using ( auth.uid() = client_id );

create policy "Clients can join waitlist"
  on public.waitlist for insert
  with check ( auth.uid() = client_id );

-- Indices
create index idx_waitlist_company on public.waitlist(company_id);
create index idx_waitlist_service_time on public.waitlist(service_id, start_time);
create index idx_waitlist_client on public.waitlist(client_id);

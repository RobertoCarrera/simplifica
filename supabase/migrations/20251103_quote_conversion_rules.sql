-- Migration: Quote conversion rules, global/company settings, and scheduling support
-- Date: 2025-11-03

-- Ensure required extensions (gen_random_uuid)
create extension if not exists pgcrypto;

-- 1) Global application settings (singleton-ish)
create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  default_convert_policy text not null default 'manual' check (default_convert_policy in ('manual','on_accept','scheduled')),
  ask_before_convert boolean not null default true,
  enforce_globally boolean not null default false,
  -- Optional future defaults
  default_payment_terms text,
  default_invoice_delay_days integer not null default 0
);

create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- Update timestamp trigger
drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
before update on public.app_settings
for each row execute function public.fn_touch_updated_at();

-- 2) Company-level settings (override hierarchy)
create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  convert_policy text check (convert_policy in ('manual','on_accept','scheduled')),
  ask_before_convert boolean,
  enforce_company_defaults boolean not null default false,
  payment_terms text,
  invoice_on_date date,
  default_invoice_delay_days integer
);

drop trigger if exists trg_company_settings_updated_at on public.company_settings;
create trigger trg_company_settings_updated_at
before update on public.company_settings
for each row execute function public.fn_touch_updated_at();

-- 3) Quotes enhancements (acceptance + conversion planning)
alter table public.quotes
  add column if not exists accepted_at timestamptz,
  add column if not exists convert_policy text check (convert_policy in ('manual','on_accept','scheduled')),
  add column if not exists deposit_percentage numeric(5,2),
  add column if not exists invoice_on_date date,
  add column if not exists conversion_status text not null default 'not_converted' check (conversion_status in ('not_converted','scheduled','converted','partial'));

-- 4) Generic scheduled jobs table (future executor / worker will process)
create table if not exists public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  scheduled_at timestamptz not null,
  executed_at timestamptz,
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed','canceled')),
  job_type text not null,
  payload jsonb not null,
  retry_count integer not null default 0,
  last_error text
);

-- 5) RLS Policies
-- Enable RLS
alter table public.app_settings enable row level security;
alter table public.company_settings enable row level security;
alter table public.scheduled_jobs enable row level security;

-- Helper predicate: admin/staff of the same company
create or replace function public.is_company_admin(target_company uuid)
returns boolean language sql stable as $$
  select (
    auth.role() = 'service_role'
    or exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.company_id = target_company
        and u.role in ('admin','manager','owner')
    )
  );
$$;

-- app_settings: only service role and platform admins (users.role in admin-like) can read/write
create policy app_settings_read on public.app_settings
  for select using (
    auth.role() = 'service_role' or exists (
      select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','owner')
    )
  );
create policy app_settings_write on public.app_settings
  for all using (
    auth.role() = 'service_role' or exists (
      select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','owner')
    )
  ) with check (
    auth.role() = 'service_role' or exists (
      select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','owner')
    )
  );

-- company_settings: admins of the company (or service role)
create policy company_settings_read on public.company_settings
  for select using (public.is_company_admin(company_id));
create policy company_settings_write on public.company_settings
  for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

-- scheduled_jobs: service role full access; admins can read their company-related ones (optional)
-- For simplicity now: only service role can insert/update/delete; admins can select
create policy scheduled_jobs_read on public.scheduled_jobs
  for select using (
    auth.role() = 'service_role' or exists (
      select 1 from public.users u where u.id = auth.uid() and u.role in ('admin','owner')
    )
  );
create policy scheduled_jobs_write on public.scheduled_jobs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Indexes helpful for scheduler
create index if not exists idx_scheduled_jobs_status_time on public.scheduled_jobs(status, scheduled_at);
create index if not exists idx_scheduled_jobs_type on public.scheduled_jobs(job_type);

-- Seed a default app_settings row if none exists
insert into public.app_settings (id)
select gen_random_uuid()
where not exists (select 1 from public.app_settings);

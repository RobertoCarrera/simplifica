-- Ensure ticket_comments table exists
create table if not exists public.ticket_comments (
  id uuid default gen_random_uuid() primary key,
  ticket_id uuid references public.tickets(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete cascade not null,
  content text not null,
  is_internal boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- Add RLS policies if they don't exist (basic check)
alter table public.ticket_comments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ticket_comments' and policyname = 'Users can view comments for their company') then
    create policy "Users can view comments for their company"
      on public.ticket_comments for select
      using ( company_id in (
        select company_id from public.users where auth_user_id = auth.uid()
      ));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'ticket_comments' and policyname = 'Users can insert comments for their company') then
    create policy "Users can insert comments for their company"
      on public.ticket_comments for insert
      with check ( company_id in (
        select company_id from public.users where auth_user_id = auth.uid()
      ));
  end if;
end
$$;

-- Enable RLS and add policies for verifactu_settings
-- Grants owner/admin (via users table mapping) SELECT, INSERT, UPDATE.
-- Uses auth.uid() mapped through public.users.auth_user_id.

begin;

alter table public.verifactu_settings enable row level security;

-- Drop existing policies if re-running (idempotent approach)
do $$
declare
  pol text;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='verifactu_settings' loop
    execute format('drop policy %I on public.verifactu_settings', pol);
  end loop;
end $$;

create policy verifactu_read_owner_admin
  on public.verifactu_settings for select
  using (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.company_id = verifactu_settings.company_id
        and u.role in ('owner','admin')
        and u.deleted_at is null
    )
  );

create policy verifactu_insert_owner_admin
  on public.verifactu_settings for insert
  with check (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.company_id = verifactu_settings.company_id
        and u.role in ('owner','admin')
        and u.deleted_at is null
    )
  );

create policy verifactu_update_owner_admin
  on public.verifactu_settings for update
  using (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.company_id = verifactu_settings.company_id
        and u.role in ('owner','admin')
        and u.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.company_id = verifactu_settings.company_id
        and u.role in ('owner','admin')
        and u.deleted_at is null
    )
  );

commit;

-- NOTE: service_role bypasses RLS (Edge Function upsert still works)
-- To allow anonymous reading (NOT RECOMMENDED for sensitive data), an explicit policy would be required.
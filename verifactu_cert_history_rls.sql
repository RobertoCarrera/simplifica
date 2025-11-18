-- Enable RLS and policies for verifactu_cert_history
begin;

alter table public.verifactu_cert_history enable row level security;

-- Drop existing policies idempotently
do $$
declare pol text; begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='verifactu_cert_history' loop
    execute format('drop policy %I on public.verifactu_cert_history', pol);
  end loop;
end $$;

create policy verifactu_history_select_owner_admin
  on public.verifactu_cert_history for select
  using (exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and u.company_id = verifactu_cert_history.company_id
      and u.role in ('owner','admin')
      and u.deleted_at is null));

create policy verifactu_history_insert_service
  on public.verifactu_cert_history for insert
  with check (auth.role() = 'service_role'); -- only via service role function

commit;

-- NOTE: No update/delete policies: history rows should be immutable.
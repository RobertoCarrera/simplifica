-- Ensure constraints and indexes required by Edge Function upserts exist
-- This makes ON CONFLICT (company_id, email) work and speeds up token lookups

-- 1) Unique constraint on (company_id, email) so upsert ... on conflict works
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'company_invitations'
      and c.conname = 'company_invitations_company_email_uniq'
  ) then
    alter table public.company_invitations
      add constraint company_invitations_company_email_uniq
      unique (company_id, email);
  end if;
end $$;

-- 2) Index on token for fast lookups on /invite
do $$
begin
  if not exists (
    select 1 from pg_class where relname = 'idx_company_invitations_token'
  ) then
    create index idx_company_invitations_token on public.company_invitations (token);
  end if;
end $$;

-- 3) Optional: keep only pending invites non-expired via check or rely on app logic
--    We won’t enforce here to avoid breaking existing data; app already checks status/expiry.

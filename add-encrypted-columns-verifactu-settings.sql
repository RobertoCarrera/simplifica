-- Adds encrypted columns expected by the Edge Function and ensures upsert works.
-- Safe to run multiple times.

begin;

-- 1) Add encrypted columns if missing
alter table if exists public.verifactu_settings
  add column if not exists cert_pem_enc text,
  add column if not exists key_pem_enc text,
  add column if not exists key_pass_enc text;

-- 2) Ensure updated_at exists (already present per your schema dump)
-- If it didn't exist, uncomment next line
-- alter table public.verifactu_settings add column if not exists updated_at timestamptz default now();

-- 3) Ensure a unique index on company_id for onConflict upsert target
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public'
      and tablename='verifactu_settings'
      and indexname='verifactu_settings_company_id_key'
  ) then
    execute 'create unique index verifactu_settings_company_id_key on public.verifactu_settings(company_id)';
  end if;
end $$;

commit;

-- Optional: If you want to backfill encrypted columns from existing plain columns,
-- you must encrypt on the client first. Do not copy plaintext into *_enc.
-- Leave them null until the UI saves a new encrypted payload.

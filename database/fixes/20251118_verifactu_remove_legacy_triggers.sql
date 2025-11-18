-- Purpose: Remove legacy triggers/rules on verifactu_settings that reference dropped columns
--          and ensure a safe updated_at trigger exists.
-- Context: Legacy columns cert_pem, key_pem, key_passphrase were removed.
-- Error seen: record "new" has no field "cert_pem" (trigger function still referencing legacy fields).

-- 1) Drop triggers on verifactu_settings whose function body mentions legacy columns
do $$
declare
  r record;
begin
  for r in
    select t.tgname, p.proname, pg_get_functiondef(p.oid) as def
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname = 'verifactu_settings'
      and not t.tgisinternal
  loop
    if r.def ilike '%cert_pem%' or r.def ilike '%key_pem%' or r.def ilike '%key_passphrase%'
    then
      execute format('drop trigger if exists %I on public.verifactu_settings;', r.tgname);
      raise notice 'Dropped trigger % on public.verifactu_settings (legacy reference found)', r.tgname;
    end if;
  end loop;
end $$;

-- 2) Drop rules on verifactu_settings that mention legacy columns (rare, but safe to check)
do $$
declare
  r record;
begin
  for r in
    select rulename, definition
    from pg_rules
    where schemaname = 'public' and tablename = 'verifactu_settings'
  loop
    if r.definition ilike '%cert_pem%' or r.definition ilike '%key_pem%' or r.definition ilike '%key_passphrase%'
    then
      execute format('drop rule if exists %I on public.verifactu_settings;', r.rulename);
      raise notice 'Dropped rule % on public.verifactu_settings (legacy reference found)', r.rulename;
    end if;
  end loop;
end $$;

-- 3) Ensure update_updated_at_column() exists
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_updated_at_column'
  ) then
    create or replace function public.update_updated_at_column()
    returns trigger
    language plpgsql
    as $$
    begin
      if TG_OP in ('UPDATE','INSERT') then
        if new.updated_at is distinct from now() then
          new.updated_at := now();
        end if;
      end if;
      return new;
    end;
    $$;
    raise notice 'Created function public.update_updated_at_column()';
  end if;
end $$;

-- 4) Ensure a simple updated_at trigger exists (does not touch legacy fields)
do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'verifactu_settings' and t.tgname = 'trg_verifactu_settings_updated_at'
  ) then
    create trigger trg_verifactu_settings_updated_at
      before update on public.verifactu_settings
      for each row execute function public.update_updated_at_column();
    raise notice 'Created trigger trg_verifactu_settings_updated_at on public.verifactu_settings';
  end if;
end $$;

-- 5) Quick sanity: show remaining triggers on table
-- select t.tgname, p.proname
-- from pg_trigger t
-- join pg_class c on c.oid = t.tgrelid
-- join pg_namespace n on n.oid = c.relnamespace
-- join pg_proc p on p.oid = t.tgfoid
-- where n.nspname='public' and c.relname='verifactu_settings' and not t.tgisinternal;

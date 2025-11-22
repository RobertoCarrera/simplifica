-- Backwards compatibility view: some older functions reference "invoiceseries"
-- Create a view mapping to the canonical `invoice_series` table so RPCs
-- and legacy checks that expect `public.invoiceseries` continue to work.

begin;

-- If a table named invoiceseries exists (unlikely), preserve it by failing early.
-- Otherwise create or replace the view.
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'invoiceseries'
  ) then
    raise notice 'A physical table public.invoiceseries already exists; skipping view creation';
  else
    execute 'create or replace view public.invoiceseries as select * from public.invoice_series';
  end if;
end $$;

comment on view public.invoiceseries is 'Compatibility view for legacy code that referenced invoiceseries (maps to invoice_series)';

commit;

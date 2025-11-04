-- Idempotency for quote -> invoice conversion
-- Adds a backlink from invoices to quotes and enforces a single invoice per quote

begin;

alter table public.invoices
  add column if not exists source_quote_id uuid
    references public.quotes(id) on delete set null;

-- Ensure only one invoice can reference the same quote
create unique index if not exists invoices_source_quote_unique
  on public.invoices(source_quote_id)
  where source_quote_id is not null;

commit;

-- Adds an index to speed up channel-filtered lead queries in the CRM.
-- The metadata->>'source' expression returns text (the JSON value at
-- 'source'), so a btree index is appropriate. We use a partial index
-- that excludes NULL sources to keep the index lean, since leads
-- created via direct API (no portal_features) won't have a source.
create index if not exists idx_leads_metadata_source
  on public.leads ((metadata->>'source'))
  where metadata->>'source' is not null;

comment on index public.idx_leads_metadata_source is
  'Speeds up channel filters in the CRM: portal_catalog, portal_shop_cart, etc.';
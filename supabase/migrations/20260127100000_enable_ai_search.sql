-- Enable Vector Extension
create extension if not exists vector
with
  schema extensions;

-- Add embedding column to product_catalog
alter table product_catalog
add column if not exists embedding vector (768);

-- Create match function
create or replace function match_product_catalog (
  query_embedding vector (768),
  match_threshold float,
  match_count int
) returns table (
  id uuid,
  name text,
  brand text,
  model text,
  description text,
  similarity float
) language plpgsql stable as $$
begin
  return query
  select
    product_catalog.id,
    product_catalog.name,
    product_catalog.brand,
    product_catalog.model,
    product_catalog.description,
    1 - (product_catalog.embedding <=> query_embedding) as similarity
  from product_catalog
  where 1 - (product_catalog.embedding <=> query_embedding) > match_threshold
  order by product_catalog.embedding <=> query_embedding
  limit match_count;
end;
$$;

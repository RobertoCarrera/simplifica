-- Migration: Full-text search RPC for the /docs module (Fase 6)
-- Description: Adds public.docs_search(q text, p_limit int) — a SECURITY
-- INVOKER RPC that runs tsvector matching against docs_articles.search_tsv
-- (created in Fase 1) and filters by current_user_role() so users only see
-- articles they have visibility for. Returns category info + a relevance
-- rank so the UI can sort results client-side.
--
-- Parser: 'simple' (lowercase + strip accents) was chosen over 'spanish'
-- because the seed content mixes Spanish + English product names (CSV,
-- JSON, JWT, etc.) and 'simple' tolerates both without stemming surprises.
--
-- Author: Roberto (Simplifica)

-- =========================================================================
-- 1. docs_search RPC
-- =========================================================================
create or replace function public.docs_search(
  q text,
  p_limit int default 20
)
returns table (
  id uuid,
  slug text,
  title text,
  summary text,
  category_slug text,
  category_name text,
  rank real
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    a.id,
    a.slug,
    a.title,
    a.summary,
    c.slug  as category_slug,
    c.name  as category_name,
    ts_rank(a.search_tsv, websearch_to_tsquery('simple', q)) as rank
  from public.docs_articles a
  join public.docs_categories c on c.id = a.category_id
  where a.status = 'published'
    and a.search_tsv @@ websearch_to_tsquery('simple', q)
    and exists (
      select 1
      from public.docs_article_roles r
      where r.article_id = a.id
        and r.role = public.current_user_role()
    )
  order by rank desc, a.published_at desc
  limit greatest(p_limit, 1);
$$;

comment on function public.docs_search(text, int) is
  'FTS over published docs_articles visible to the current role. Returns top N ranked by ts_rank, ordered by rank desc then published_at desc.';

-- =========================================================================
-- 2. Grants
-- =========================================================================
revoke all on function public.docs_search(text, int) from public;
grant execute on function public.docs_search(text, int) to authenticated;

-- =========================================================================
-- 3. Reload PostgREST schema (so generated types refresh)
-- =========================================================================
notify pgrst, 'reload schema';

-- Migration: Documentation schema for the CRM
-- Description: Adds a /docs system to Simplifica — categories, articles,
-- role-based visibility, and a tsvector + GIN index for full-text search.
-- All content is authored in Markdown and rendered with a whitelist
-- sanitizer on the frontend. The system is global (not per-company) but
-- articles can be restricted to specific app_roles.
--
-- Roles come from public.app_roles (name: super_admin, owner, admin,
-- supervisor, member, professional, agent, marketer). For backward
-- compatibility with the JWT (which does not include app_role), we
-- expose a SECURITY DEFINER helper that resolves the current user's
-- role from public.users + public.app_roles in a single round-trip.
--
-- Author: Roberto (Simplifica)

-- =========================================================================
-- 1. Helper: resolve current user's app_role.name
-- =========================================================================
-- Returns the role name (e.g. 'owner') for the authenticated user, or
-- 'anonymous' if no user row is found. SECURITY DEFINER so RLS can use
-- it without needing to grant direct table access to all roles.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT r.name
            FROM public.users u
            JOIN public.app_roles r ON r.id = u.app_role_id
            WHERE u.auth_user_id = auth.uid()
            LIMIT 1
        ),
        'anonymous'
    );
$$;

COMMENT ON FUNCTION public.current_user_role() IS
  'Returns the app_role.name (super_admin, owner, admin, supervisor, member, professional, agent, marketer) for the current authenticated user, or "anonymous" if not found.';

-- =========================================================================
-- 2. Tables
-- =========================================================================

-- 2.1 docs_categories — hierarchical (parent_id) grouping for articles
CREATE TABLE IF NOT EXISTS public.docs_categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL UNIQUE,
    name        text NOT NULL,
    description text,
    icon        text,           -- bootstrap-icon name (e.g. "people-fill")
    sort_order  int NOT NULL DEFAULT 0,
    parent_id   uuid REFERENCES public.docs_categories(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS docs_categories_parent_idx
  ON public.docs_categories (parent_id, sort_order);

COMMENT ON TABLE public.docs_categories IS
  'Hierarchical categories for documentation articles.';

-- 2.2 docs_articles — the actual content (markdown source + cached HTML)
CREATE TABLE IF NOT EXISTS public.docs_articles (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                text NOT NULL UNIQUE,
    title               text NOT NULL,
    summary             text,
    content_markdown    text NOT NULL,
    content_html        text,           -- rendered server-side or by frontend; we
                                       -- render on the client (marked + sanitize)
    category_id         uuid NOT NULL REFERENCES public.docs_categories(id) ON DELETE RESTRICT,
    status              text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'published', 'archived')),
    author_user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
    search_tsv          tsvector GENERATED ALWAYS AS (
                          setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                          setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
                          setweight(to_tsvector('simple', coalesce(content_markdown, '')), 'C')
                        ) STORED,
    published_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- GIN for fast full-text search; btree for the category-listing view
CREATE INDEX IF NOT EXISTS docs_articles_search_tsv_idx
  ON public.docs_articles USING GIN (search_tsv);

-- sort_in_category: per-category article order. We add it as a real column
-- so admins can reorder articles inside a category without a separate
-- join table. Migration: do not retro-backfill (default 0).
ALTER TABLE public.docs_articles
  ADD COLUMN IF NOT EXISTS sort_in_category int NOT NULL DEFAULT 0;

-- Re-create the index to include the new column
DROP INDEX IF EXISTS public.docs_articles_category_published_idx;
CREATE INDEX docs_articles_category_published_idx
  ON public.docs_articles (category_id, sort_in_category, published_at DESC);

COMMENT ON TABLE public.docs_articles IS
  'Documentation articles. Markdown source is the source of truth; content_html is an optional cache.';

-- 2.3 docs_article_roles — which app_roles can see which articles
-- Composite PK enforces one row per (article, role).
CREATE TABLE IF NOT EXISTS public.docs_article_roles (
    article_id uuid NOT NULL REFERENCES public.docs_articles(id) ON DELETE CASCADE,
    role       text NOT NULL,
    PRIMARY KEY (article_id, role)
);

CREATE INDEX IF NOT EXISTS docs_article_roles_role_idx
  ON public.docs_article_roles (role);

COMMENT ON TABLE public.docs_article_roles IS
  'Visibility: each row means the article is visible to that app_role.name. An article with no rows is invisible to everyone (effectively a draft).';

-- =========================================================================
-- 3. updated_at triggers
-- =========================================================================
CREATE OR REPLACE FUNCTION public.docs_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_docs_categories_updated_at ON public.docs_categories;
CREATE TRIGGER trg_docs_categories_updated_at
  BEFORE UPDATE ON public.docs_categories
  FOR EACH ROW EXECUTE FUNCTION public.docs_touch_updated_at();

DROP TRIGGER IF EXISTS trg_docs_articles_updated_at ON public.docs_articles;
CREATE TRIGGER trg_docs_articles_updated_at
  BEFORE UPDATE ON public.docs_articles
  FOR EACH ROW EXECUTE FUNCTION public.docs_touch_updated_at();

-- =========================================================================
-- 4. RLS policies
-- =========================================================================
ALTER TABLE public.docs_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs_articles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs_article_roles  ENABLE ROW LEVEL SECURITY;

-- Helper predicate: is the current user a super_admin? (only super_admin
-- can write docs in the MVP; owners can read everything).
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.current_user_role() = 'super_admin';
$$;

-- ---------- docs_categories ----------
DROP POLICY IF EXISTS docs_categories_read ON public.docs_categories;
CREATE POLICY docs_categories_read
  ON public.docs_categories
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS docs_categories_write ON public.docs_categories;
CREATE POLICY docs_categories_write
  ON public.docs_categories
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------- docs_articles ----------
-- Read: any authenticated user can see a *published* article whose
-- `docs_article_roles` contains their role. Super admins can also see
-- drafts (for previewing content before publishing).
DROP POLICY IF EXISTS docs_articles_read ON public.docs_articles;
CREATE POLICY docs_articles_read
  ON public.docs_articles
  FOR SELECT
  TO authenticated
  USING (
    (status = 'published' AND EXISTS (
        SELECT 1 FROM public.docs_article_roles r
        WHERE r.article_id = docs_articles.id
          AND r.role = public.current_user_role()
    ))
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS docs_articles_write ON public.docs_articles;
CREATE POLICY docs_articles_write
  ON public.docs_articles
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------- docs_article_roles ----------
-- Read follows the article (if you can read the article, you can read
-- the role rows that grant access to it). Easier: allow read on all rows
-- for authenticated users (no PII here).
DROP POLICY IF EXISTS docs_article_roles_read ON public.docs_article_roles;
CREATE POLICY docs_article_roles_read
  ON public.docs_article_roles
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS docs_article_roles_write ON public.docs_article_roles;
CREATE POLICY docs_article_roles_write
  ON public.docs_article_roles
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- =========================================================================
-- 5. Grant table-level access
-- =========================================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.docs_categories, public.docs_articles, public.docs_article_roles
  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.docs_categories, public.docs_articles, public.docs_article_roles
  TO authenticated;

-- =========================================================================
-- 6. notify PostgREST to reload schema (so generated types refresh)
-- =========================================================================
NOTIFY pgrst, 'reload schema';

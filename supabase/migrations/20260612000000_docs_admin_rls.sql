-- Migration: Admin RLS + reorder RPCs for docs module
-- Adds superadmin-only write access to docs_categories and docs_articles,
-- plus two SECURITY DEFINER RPCs for atomic batch reorder.
--
-- Pre-requisites:
--   - current_user_role() function (already created by 20260611140000_docs_search_rpc.sql)
--   - docs_categories, docs_articles tables (20260611120000_docs_schema.sql)

-- 1) Categories: archive column + partial index for fast "not archived" lookups
ALTER TABLE public.docs_categories
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS docs_categories_archived_idx
  ON public.docs_categories (archived_at)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN public.docs_categories.archived_at IS
  'When set, the category is hidden from the public docs sidebar but kept in the DB for restoration.';

-- 2) Admin RLS policies: one FOR ALL policy per table, gated by super_admin.
--    Source of truth: current_user_role() SQL function (returns app_role.name).

DROP POLICY IF EXISTS docs_categories_admin_all ON public.docs_categories;
CREATE POLICY docs_categories_admin_all
  ON public.docs_categories
  FOR ALL
  USING (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

DROP POLICY IF EXISTS docs_articles_admin_all ON public.docs_articles;
CREATE POLICY docs_articles_admin_all
  ON public.docs_articles
  FOR ALL
  USING (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

-- 3) Reorder RPCs. SECURITY DEFINER so we can do a single role check at the
--    top and then bulk update. RLS is bypassed inside the function but the
--    role check at the top is the explicit gate.

CREATE OR REPLACE FUNCTION public.docs_reorder_categories(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_i    int;
BEGIN
  SELECT public.current_user_role() INTO v_role;
  IF v_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'forbidden: super_admin required'
      USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOR v_i IN 1 .. array_length(p_ids, 1) LOOP
    UPDATE public.docs_categories
       SET sort_order = v_i
     WHERE id = p_ids[v_i];
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.docs_reorder_articles(
  p_category_id uuid,
  p_ids         uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_i    int;
BEGIN
  SELECT public.current_user_role() INTO v_role;
  IF v_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'forbidden: super_admin required'
      USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOR v_i IN 1 .. array_length(p_ids, 1) LOOP
    UPDATE public.docs_articles
       SET sort_in_category = v_i
     WHERE id = p_ids[v_i]
       AND category_id = p_category_id;
  END LOOP;
END;
$$;

-- 4) Lock down: only authenticated role can call them.
REVOKE ALL ON FUNCTION public.docs_reorder_categories(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.docs_reorder_categories(uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.docs_reorder_articles(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.docs_reorder_articles(uuid, uuid[]) TO authenticated;

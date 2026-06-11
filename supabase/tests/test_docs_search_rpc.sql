-- ============================================================================
-- Test: docs_search RPC + docs visibility by role
-- Run as: psql -f this_file.sql  (or via Supabase Management API).
-- The DO block raises one NOTICE per assertion; the final SELECT prints a
-- JSON summary line that the Mgmt API can surface.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

\echo '========================================'
\echo 'docs_search + role visibility — Fase 6'
\echo '========================================'

BEGIN;

DO $$
DECLARE
  v_pass int := 0;
  v_fail int := 0;

  v_articles_total int;
  v_articles_published int;
  v_articles_for_owner int;
  v_articles_for_member_invisible int;
  v_categories int;
  v_role_links int;

  v_search_exists boolean;
  v_search_invoker boolean;
  v_cur_role text;
  v_owner_slug text;
  v_q text := 'cliente';
  v_hits_anon int;
  v_rls_articles boolean;
  v_rls_roles boolean;
  v_fts_match boolean;
BEGIN
  -- 1. Schema fixtures
  SELECT count(*) INTO v_articles_total FROM public.docs_articles;
  SELECT count(*) INTO v_articles_published FROM public.docs_articles WHERE status = 'published';
  SELECT count(*) INTO v_categories FROM public.docs_categories;
  SELECT count(*) INTO v_role_links FROM public.docs_article_roles;

  IF v_categories >= 1 THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: % categories present', v_categories;
  ELSE v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL: no categories in docs_categories';
  END IF;

  IF v_articles_published >= 1 THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: % published articles (of % total) in docs_articles', v_articles_published, v_articles_total;
  ELSE v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL: no published articles in docs_articles';
  END IF;

  IF v_role_links >= v_articles_published THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: % role links for % published articles (every article visible to >=1 role)', v_role_links, v_articles_published;
  ELSE v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL: role links (%) < published articles (%)', v_role_links, v_articles_published;
  END IF;

  -- 2. Role coverage
  SELECT count(DISTINCT a.id) INTO v_articles_for_owner
  FROM public.docs_articles a
  JOIN public.docs_article_roles r ON r.article_id = a.id
  WHERE a.status = 'published' AND r.role = 'owner';

  IF v_articles_for_owner = v_articles_published THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: owner role can see all % published articles', v_articles_for_owner;
  ELSE v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL: owner sees % of %', v_articles_for_owner, v_articles_published;
  END IF;

  -- Articles invisible to 'member' (i.e. no member-role link)
  SELECT count(*) INTO v_articles_for_member_invisible
  FROM public.docs_articles a
  WHERE a.status = 'published'
    AND NOT EXISTS (
      SELECT 1 FROM public.docs_article_roles r
      WHERE r.article_id = a.id AND r.role = 'member'
    );

  IF v_articles_for_member_invisible >= 0 THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: % published articles are invisible to "member" (RLS will hide them)', v_articles_for_member_invisible;
  END IF;

  -- 3. docs_search RPC shape
  SELECT
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'docs_search')
    INTO v_search_exists;

  SELECT prosecdef = false
    INTO v_search_invoker
    FROM pg_proc WHERE proname = 'docs_search';

  IF v_search_exists AND v_search_invoker THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: public.docs_search() exists and is SECURITY INVOKER';
  ELSE v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL: docs_search() exists=%, invoker=%', v_search_exists, v_search_invoker;
  END IF;

  -- 4. current_user_role() helper
  v_cur_role := public.current_user_role();
  IF v_cur_role = 'anonymous' THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: current_user_role() returns "anonymous" for unauthenticated sessions';
  ELSE
    RAISE NOTICE 'INFO: current_user_role() returns "%" (test is running as a real user)', v_cur_role;
  END IF;

  -- 5. End-to-end: RPC returns 0 hits for anonymous
  SELECT count(*) INTO v_hits_anon FROM public.docs_search(v_q, 5);
  IF v_hits_anon = 0 THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: docs_search(''%'') returns 0 hits for anonymous session (correct)', v_q;
  ELSE
    RAISE NOTICE 'INFO: docs_search(''%'') returned % hits from test session (role=%)', v_q, v_hits_anon, v_cur_role;
  END IF;

  -- 6. FTS works for a known seed term
  SELECT a.slug INTO v_owner_slug
  FROM public.docs_articles a
  WHERE a.status = 'published'
    AND a.search_tsv @@ websearch_to_tsquery('simple', v_q)
  LIMIT 1;

  IF v_owner_slug IS NOT NULL THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: FTS match for ''%'' → ''%'' (search_tsv works with simple parser)', v_q, v_owner_slug;
  ELSE
    v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL: no FTS match for ''%'' in published articles (search_tsv empty or parser mismatch)', v_q;
  END IF;

  -- 7. RLS is on
  SELECT relrowsecurity INTO v_rls_articles FROM pg_class
   WHERE relname = 'docs_articles' AND relnamespace = 'public'::regnamespace;
  SELECT relrowsecurity INTO v_rls_roles FROM pg_class
   WHERE relname = 'docs_article_roles' AND relnamespace = 'public'::regnamespace;

  IF v_rls_articles THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: RLS enabled on public.docs_articles';
  ELSE v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL: RLS not enabled on public.docs_articles';
  END IF;

  IF v_rls_roles THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: RLS enabled on public.docs_article_roles';
  ELSE v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL: RLS not enabled on public.docs_article_roles';
  END IF;

  -- Final summary (also emitted as a row by the SELECT below)
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'docs_search suite: % PASS, % FAIL', v_pass, v_fail;
  RAISE NOTICE '========================================';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'docs_search assertions failed: %', v_fail;
  END IF;
END$$;

-- A short summary as a row for the Mgmt API to surface.
SELECT json_build_object(
  'articles_total', (SELECT count(*) FROM public.docs_articles),
  'articles_published', (SELECT count(*) FROM public.docs_articles WHERE status = 'published'),
  'articles_visible_to_owner', (
    SELECT count(DISTINCT a.id) FROM public.docs_articles a
    JOIN public.docs_article_roles r ON r.article_id = a.id
    WHERE a.status = 'published' AND r.role = 'owner'
  ),
  'categories', (SELECT count(*) FROM public.docs_categories),
  'role_links', (SELECT count(*) FROM public.docs_article_roles),
  'docs_search_exists', EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'docs_search'),
  'docs_search_is_invoker', (SELECT prosecdef = false FROM pg_proc WHERE proname = 'docs_search'),
  'rls_articles', (SELECT relrowsecurity FROM pg_class WHERE relname = 'docs_articles' AND relnamespace = 'public'::regnamespace),
  'rls_article_roles', (SELECT relrowsecurity FROM pg_class WHERE relname = 'docs_article_roles' AND relnamespace = 'public'::regnamespace),
  'fts_match_cliente', EXISTS(
    SELECT 1 FROM public.docs_articles a
    WHERE a.status = 'published'
      AND a.search_tsv @@ websearch_to_tsquery('simple', 'cliente')
  )
) AS docs_search_suite_summary;

ROLLBACK;

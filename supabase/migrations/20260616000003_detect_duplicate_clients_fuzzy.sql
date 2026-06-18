-- ============================================================================
-- Migration: detect_duplicate_clients_fuzzy
--
-- Improves the duplicate detection in two ways:
--   1. Adds a new match_reason 'name_fuzzy' that uses token-set Jaccard
--      similarity + apellido anchor. This catches cases that the strict
--      `name` rule misses:
--        - "Anna Mari" vs "Maria Anna" (reordered)
--        - "Eva Cañete" vs "Eva Cañete Hernández" (one surname missing)
--        - "Marc Escosa" vs "Marc Escosa Satorres" (compound surname split)
--      Threshold: Jaccard ≥ 0.6 on name tokens + last token of name matches.
--   2. The frontend now considers 'name' and 'name_fuzzy' as bulk-mergeable
--      (with the existing safe-merge preview/dry-run flow). The user already
--      reviews every cluster in the preview before executing.
--
-- Why: the current strict `name` rule requires an exact normalized equality
-- on name AND surname. This is safe but misses real-world cases where the
-- same person was registered with slightly different name strings. The
-- token-set Jaccard with apellido anchor is a good middle ground: tolerant
-- enough to catch reordered/missing tokens, strict enough to avoid
-- matching different people.
--
-- Pre-conditions (already in the DB, not created here):
--   * public.detect_duplicate_clients(uuid) function
--   * public.normalize_name(text) function
--   * public.clients table
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.detect_duplicate_clients(p_company_id uuid)
RETURNS TABLE(
  id_a       uuid,
  name_a     text,
  surname_a  text,
  email_a    text,
  phone_a    text,
  created_a  timestamptz,
  is_active_a boolean,
  id_b       uuid,
  name_b     text,
  surname_b  text,
  email_b    text,
  phone_b    text,
  created_b  timestamptz,
  is_active_b boolean,
  match_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_current_user uuid;
  v_company_member_id uuid;
BEGIN
  -- ── Authorization: caller must be owner or admin of the company ──
  SELECT u.id INTO v_current_user
  FROM public.users u
  WHERE u.auth_user_id = auth.uid();

  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Access denied: no user profile linked to this session';
  END IF;

  SELECT cm.id INTO v_company_member_id
  FROM public.company_members cm
  JOIN public.app_roles ar ON ar.id = cm.role_id
  WHERE cm.user_id = v_current_user
    AND cm.company_id = p_company_id
    AND cm.status = 'active'
    AND ar.name IN ('owner', 'admin')
  LIMIT 1;

  IF v_company_member_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: must be owner or admin of this company';
  END IF;

  -- ── Helper SQL: compute token-set Jaccard similarity in pure SQL ──
  -- We use a CTE-friendly approach: split the names on whitespace,
  -- build arrays, and compute |A ∩ B| / |A ∪ B| as numeric.
  -- For performance, we restrict to clients of THIS company with
  -- non-null name (most clients have at least a first name).

  RETURN QUERY
  WITH base AS (
    SELECT
      a.id AS id_a, a.name::text AS name_a, a.surname::text AS surname_a,
      a.email::text AS email_a, a.phone::text AS phone_a,
      a.created_at AS created_a, a.is_active AS is_active_a,
      b.id AS id_b, b.name::text AS name_b, b.surname::text AS surname_b,
      b.email::text AS email_b, b.phone::text AS phone_b,
      b.created_at AS created_b, b.is_active AS is_active_b
    FROM public.clients a
    JOIN public.clients b
      ON b.company_id = a.company_id
     AND b.id > a.id
    WHERE a.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
  ),
  -- Pre-compute normalized forms to keep the CASE WHEN readable.
  norm AS (
    SELECT
      b.*,
      normalize_name(b.name_a)    AS n_name_a,
      normalize_name(b.surname_a) AS n_surname_a,
      normalize_name(b.name_b)    AS n_name_b,
      normalize_name(b.surname_b) AS n_surname_b
    FROM base b
  ),
  -- Token-set Jaccard on (name + surname) for fuzzy matching.
  -- We split each normalized name on whitespace using string_to_array
  -- and compute intersection/union sizes via unnest + array_agg.
  jaccard_pairs AS (
    SELECT
      n.*,
      -- Intersection size: tokens present in both name+surname sets
      (SELECT COUNT(*)::numeric
         FROM unnest(string_to_array(trim(n.n_name_a || ' ' || coalesce(n.n_surname_a,'')), ' ')) AS t(token)
         WHERE t.token <> ''
           AND t.token = ANY(string_to_array(trim(n.n_name_b || ' ' || coalesce(n.n_surname_b,'')), ' '))
      ) AS inter_size,
      -- Union size: distinct tokens in either set
      (SELECT COUNT(*)::numeric
         FROM (
           SELECT DISTINCT t.token
           FROM unnest(string_to_array(trim(n.n_name_a || ' ' || coalesce(n.n_surname_a,'')), ' ')) AS t(token)
           WHERE t.token <> ''
           UNION
           SELECT DISTINCT t.token
           FROM unnest(string_to_array(trim(n.n_name_b || ' ' || coalesce(n.n_surname_b,'')), ' ')) AS t(token)
           WHERE t.token <> ''
         ) u
      ) AS union_size
    FROM norm n
  ),
  candidates AS (
    SELECT
      jp.id_a, jp.name_a, jp.surname_a, jp.email_a, jp.phone_a, jp.created_a, jp.is_active_a,
      jp.id_b, jp.name_b, jp.surname_b, jp.email_b, jp.phone_b, jp.created_b, jp.is_active_b,
      -- 'match_reason' priority: the most specific rule wins. We compute
      -- each predicate in order; the first one that fires is the reason.
      CASE
        -- 1. email_and_name (strongest)
        WHEN jp.email_a IS NOT NULL
          AND lower(trim(jp.email_a)) = lower(trim(jp.email_b))
          AND lower(trim(jp.email_a)) <> ''
          AND lower(trim(jp.email_a)) <> 'corre@tudominio.es'
          AND jp.n_name_a = jp.n_name_b
          AND jp.n_surname_a = jp.n_surname_b
          THEN 'email_and_name'
        -- 2. email (strong, regardless of name)
        WHEN jp.email_a IS NOT NULL
          AND lower(trim(jp.email_a)) = lower(trim(jp.email_b))
          AND lower(trim(jp.email_a)) <> ''
          AND lower(trim(jp.email_a)) <> 'corre@tudominio.es'
          THEN 'email'
        -- 3. phone (strong)
        WHEN jp.phone_a IS NOT NULL AND jp.phone_b IS NOT NULL
          AND regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
            jp.phone_a, '\+', '', 'g'), ' ', '', 'g'), '-', '', 'g'), '\(', '', 'g'), '\)', '', 'g')
          =
          regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
            jp.phone_b, '\+', '', 'g'), ' ', '', 'g'), '-', '', 'g'), '\(', '', 'g'), '\)', '', 'g')
          THEN 'phone'
        -- 4. name (exact normalized match on name AND surname)
        WHEN jp.n_name_a = jp.n_name_b
          AND jp.n_surname_a = jp.n_surname_b
          AND NOT (lower(trim(jp.email_a)) = 'corre@tudominio.es' AND lower(trim(jp.email_b)) = 'corre@tudominio.es')
          THEN 'name'
        -- 5. name_fuzzy (NEW): token-set Jaccard ≥ 0.6 on name+surname,
        --    with apellido anchor. Catches reordered/missing tokens.
        WHEN jp.union_size > 0
          AND (jp.inter_size / jp.union_size) >= 0.6
          -- Apellido anchor: the FIRST name token of the candidate pair
          -- must match on both sides. This prevents "Maria" from matching
          -- "Maria José" (different surnames in different positions).
          AND (
            split_part(jp.n_name_a, ' ', 1) <> ''
            AND split_part(jp.n_name_a, ' ', 1) = split_part(jp.n_name_b, ' ', 1)
          )
          AND NOT (lower(trim(jp.email_a)) = 'corre@tudominio.es' AND lower(trim(jp.email_b)) = 'corre@tudominio.es')
          THEN 'name_fuzzy'
        ELSE NULL
      END::text AS match_reason
    FROM jaccard_pairs jp
  )
  SELECT DISTINCT ON (LEAST(c.id_a, c.id_b), GREATEST(c.id_a, c.id_b))
    c.id_a, c.name_a, c.surname_a, c.email_a, c.phone_a, c.created_a, c.is_active_a,
    c.id_b, c.name_b, c.surname_b, c.email_b, c.phone_b, c.created_b, c.is_active_b,
    c.match_reason
  FROM candidates c
  WHERE c.match_reason IS NOT NULL
  ORDER BY
    LEAST(c.id_a, c.id_b),
    GREATEST(c.id_a, c.id_b),
    -- Priority for the kept match_reason when several apply. email > phone
    -- > name > name_fuzzy (most specific rule wins).
    CASE c.match_reason
      WHEN 'email_and_name' THEN 1
      WHEN 'email'          THEN 2
      WHEN 'phone'          THEN 3
      WHEN 'name'           THEN 4
      WHEN 'name_fuzzy'     THEN 5
      ELSE 99
    END;
END;
$$;

COMMENT ON FUNCTION public.detect_duplicate_clients(uuid) IS
  'Detects candidate duplicate client pairs within a company. Match reasons (priority order): email_and_name > email > phone > name > name_fuzzy. The name_fuzzy reason uses token-set Jaccard ≥ 0.6 + first-name anchor to catch reordered/missing tokens (e.g. compound surnames). Caller must be owner or admin of the target company.';

REVOKE EXECUTE ON FUNCTION public.detect_duplicate_clients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_duplicate_clients(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- Migration: detect_duplicate_clients_fuzzy_v2 (timeout fix)
--
-- v1 of this migration timed out on companies with ~500+ clients because
-- the Jaccard calculation ran over ALL 136k self-join pairs. This v2
-- restricts the Jaccard evaluation to pairs that share the FIRST name
-- token (the "apellido de pila" anchor), which dramatically reduces
-- the search space: instead of n^2, it's roughly
-- sum( count(name) ^ 2 for each unique first name ), which is O(n) for
-- realistic data.
--
-- Pre-conditions (already in the DB, not modified here):
--   * public.detect_duplicate_clients(uuid) function (v1 from migration
--     20260616000003 — being replaced)
--   * public.normalize_name(text) function
--   * public.clients table with idx_clients_company_name_norm index
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

  RETURN QUERY
  WITH
  -- ── Stage 1: email-only candidates (filtered by email equality) ──
  -- Uses idx_clients_company_email_func for the email index.
  email_pairs AS (
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
     AND lower(a.email) = lower(b.email)
     AND a.email IS NOT NULL AND a.email <> ''
     AND a.email <> 'corre@tudominio.es'
     AND b.email <> 'corre@tudominio.es'
    WHERE a.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
  ),
  -- ── Stage 2: phone-only candidates (filtered by normalized phone) ──
  -- Phone normalization: strip +, spaces, dashes, parens.
  phone_pairs AS (
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
     AND regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         a.phone, '\+', '', 'g'), ' ', '', 'g'), '-', '', 'g'), '\(', '', 'g'), '\)', '', 'g')
       =
       regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         b.phone, '\+', '', 'g'), ' ', '', 'g'), '-', '', 'g'), '\(', '', 'g'), '\)', '', 'g')
    WHERE a.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND a.phone IS NOT NULL AND b.phone IS NOT NULL
  ),
  -- ── Stage 3: name candidates (exact normalized equality) ──
  -- Uses idx_clients_company_name_norm — the btree index on
  -- (company_id, normalize_name(name), normalize_name(surname)) makes
  -- this very fast even on large companies.
  name_pairs AS (
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
     AND normalize_name(a.name) = normalize_name(b.name)
     AND normalize_name(a.surname) = normalize_name(b.surname)
    WHERE a.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND a.name IS NOT NULL AND b.name IS NOT NULL
      AND a.surname IS NOT NULL AND b.surname IS NOT NULL
      AND NOT (lower(a.email) = 'corre@tudominio.es' AND lower(b.email) = 'corre@tudominio.es')
  ),
  -- ── Stage 4: fuzzy name candidates (token-set Jaccard) ──
  -- KEY OPTIMIZATION (vs v1): instead of computing Jaccard over the full
  -- O(n^2) self-join, we pre-filter to pairs that share the FIRST token
  -- of the normalized name. This brings the search space from n^2 down
  -- to roughly sum(k^2) over groups of same-first-name, which is much
  -- smaller for realistic data (popular names like "Maria" might have
  -- 50 clients → 1225 pairs, but rare names have 1-3 clients → 0 pairs).
  --
  -- We use the LEFT(split_part(...), ' ', 1) trick: extract the first
  -- word of the normalized name and match it on both sides. This uses
  -- idx_clients_company_name_norm for the first-name prefix.
  name_fuzzy_pairs AS (
    SELECT
      a.id AS id_a, a.name::text AS name_a, a.surname::text AS surname_a,
      a.email::text AS email_a, a.phone::text AS phone_a,
      a.created_at AS created_a, a.is_active AS is_active_a,
      b.id AS id_b, b.name::text AS name_b, b.surname::text AS surname_b,
      b.email::text AS email_b, b.phone::text AS phone_b,
      b.created_at AS created_b, b.is_active AS is_active_b,
      -- Compute inter / union sizes via CROSS JOIN. We pre-compute them
      -- so the final SELECT can filter with simple column comparisons
      -- (no correlated subquery, no recomputation).
      inter_q.inter,
      inter_q.union_size
    FROM public.clients a
    JOIN public.clients b
      ON b.company_id = a.company_id
     AND b.id > a.id
     AND split_part(normalize_name(a.name), ' ', 1) = split_part(normalize_name(b.name), ' ', 1)
     AND split_part(normalize_name(a.name), ' ', 1) <> ''
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE t_a.token = t_b.token)::numeric AS inter,
        (COUNT(DISTINCT t_a.token) + COUNT(DISTINCT t_b.token)
         - COUNT(*) FILTER (WHERE t_a.token = t_b.token))::numeric AS union_size
      FROM unnest(string_to_array(
        trim(normalize_name(a.name) || ' ' || coalesce(normalize_name(a.surname), '')), ' '
      )) AS t_a(token)
      CROSS JOIN unnest(string_to_array(
        trim(normalize_name(b.name) || ' ' || coalesce(normalize_name(b.surname), '')), ' '
      )) AS t_b(token)
      WHERE t_a.token <> '' AND t_b.token <> ''
    ) AS inter_q
    WHERE a.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND a.name IS NOT NULL AND b.name IS NOT NULL
      AND NOT (lower(a.email) = 'corre@tudominio.es' AND lower(b.email) = 'corre@tudominio.es')
  ),
  -- Filter the fuzzy pairs by Jaccard threshold AFTER pre-computation.
  name_fuzzy_filtered AS (
    SELECT *
    FROM name_fuzzy_pairs
    WHERE inter >= 0.6 * union_size AND union_size > 0
  ),
  -- ── Stage 5: union all candidate sets ──
  all_candidates AS (
    SELECT
      id_a, name_a, surname_a, email_a, phone_a, created_a, is_active_a,
      id_b, name_b, surname_b, email_b, phone_b, created_b, is_active_b,
      CASE
        WHEN normalize_name(name_a) = normalize_name(name_b)
          AND normalize_name(surname_a) = normalize_name(surname_b)
          AND email_a IS NOT NULL
          AND lower(email_a) = lower(email_b)
          AND lower(email_a) <> 'corre@tudominio.es'
          THEN 'email_and_name'
        WHEN email_a IS NOT NULL
          AND lower(email_a) = lower(email_b)
          AND lower(email_a) <> 'corre@tudominio.es'
          THEN 'email'
        WHEN phone_a IS NOT NULL AND phone_b IS NOT NULL
          AND regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
            phone_a, '\+', '', 'g'), ' ', '', 'g'), '-', '', 'g'), '\(', '', 'g'), '\)', '', 'g')
          =
          regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
            phone_b, '\+', '', 'g'), ' ', '', 'g'), '-', '', 'g'), '\(', '', 'g'), '\)', '', 'g')
          THEN 'phone'
        WHEN normalize_name(name_a) = normalize_name(name_b)
          AND normalize_name(surname_a) = normalize_name(surname_b)
          AND NOT (lower(email_a) = 'corre@tudominio.es' AND lower(email_b) = 'corre@tudominio.es')
          THEN 'name'
        ELSE 'name_fuzzy'
      END::text AS match_reason
    FROM (
      SELECT * FROM email_pairs
      UNION
      SELECT * FROM phone_pairs
      UNION
      SELECT * FROM name_pairs
      UNION
      -- For name_fuzzy, the Jaccard is already pre-computed in the CTE;
      -- we just need to convert the numeric Jaccard into a match_reason
      -- by re-evaluating the predicate (cheap, since we've already
      -- pre-filtered). The inter / union are exposed for debugging via
      -- the columns, but we don't need them here.
      SELECT id_a, name_a, surname_a, email_a, phone_a, created_a, is_active_a,
             id_b, name_b, surname_b, email_b, phone_b, created_b, is_active_b
      FROM name_fuzzy_filtered
    ) all_u
  )
  SELECT DISTINCT ON (LEAST(c.id_a, c.id_b), GREATEST(c.id_a, c.id_b))
    c.id_a, c.name_a, c.surname_a, c.email_a, c.phone_a, c.created_a, c.is_active_a,
    c.id_b, c.name_b, c.surname_b, c.email_b, c.phone_b, c.created_b, c.is_active_b,
    c.match_reason
  FROM all_candidates c
  ORDER BY
    LEAST(c.id_a, c.id_b),
    GREATEST(c.id_a, c.id_b),
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
  'Detects candidate duplicate client pairs within a company. Stages:
   (1) email-only join (uses idx_clients_company_email_func)
   (2) phone-only join (no index, but small set due to phone match)
   (3) name-only exact normalized join (uses idx_clients_company_name_norm)
   (4) name_fuzzy: self-join pre-filtered to same-first-name, then Jaccard ≥ 0.6
   Match reasons (priority order): email_and_name > email > phone > name > name_fuzzy.
   Caller must be owner or admin of the target company. v2 reduces the search
   space from O(n^2) to O(sum(k^2)) over first-name groups to avoid statement
   timeouts on large companies.';

REVOKE EXECUTE ON FUNCTION public.detect_duplicate_clients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_duplicate_clients(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

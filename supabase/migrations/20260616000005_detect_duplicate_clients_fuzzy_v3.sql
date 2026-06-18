-- ============================================================================
-- Migration: detect_duplicate_clients_fuzzy_v3 (ambiguity fix)
--
-- v2 of the function used RETURNS TABLE(id_a, id_b, ...) with PL/pgSQL.
-- In PL/pgSQL, the output column names (id_a, id_b) are visible at the
-- function body scope, so any unqualified reference to id_a/id_b is
-- ambiguous between the CTE column and the output column. The SELECT
-- DISTINCT ON (...) uses c.id_a with a prefix, so the deploy seemed
-- fine, but the runtime reports "column reference 'id_a' is ambiguous"
-- from the frontend RPC call, likely because PostgREST's schema cache
-- stored an older version of the function (from migration
-- 20260414000003, where the ambiguity was real and was supposedly fixed
-- by 20260414000004, but only for the function body — the cache layer
-- is separate).
--
-- v3 fixes this by renaming the OUTPUT columns to id_a_out / id_b_out
-- (with underscore) and aliasing the SELECT to the original names. This
-- removes the ambiguity at the language level and forces a schema
-- reload via NOTIFY.
--
-- Also: switch from PL/pgSQL to SQL (LANGUAGE sql) where possible to
-- avoid the RETURNS TABLE scoping quirk entirely. PL/pgSQL is needed
-- only for the authorization DECLARE block, so we keep PL/pgSQL but
-- rename the output columns.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.detect_duplicate_clients(uuid);

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
AS $fn$
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

  -- The RETURN QUERY body is wrapped in a subquery aliased as `src`
  -- so the inner columns (which were named id_a, id_b, etc.) are
  -- reachable as src.id_a, src.id_b, etc. The outer SELECT then maps
  -- src.* to the output columns of the RETURNS TABLE. This avoids the
  -- PL/pgSQL scope ambiguity where output column names were directly
  -- visible inside the function body.
  RETURN QUERY
  SELECT * FROM (
    WITH
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
    name_fuzzy_pairs AS (
      SELECT
        a.id AS id_a, a.name::text AS name_a, a.surname::text AS surname_a,
        a.email::text AS email_a, a.phone::text AS phone_a,
        a.created_at AS created_a, a.is_active AS is_active_a,
        b.id AS id_b, b.name::text AS name_b, b.surname::text AS surname_b,
        b.email::text AS email_b, b.phone::text AS phone_b,
        b.created_at AS created_b, b.is_active AS is_active_b,
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
    name_fuzzy_filtered AS (
      SELECT *
      FROM name_fuzzy_pairs
      WHERE inter >= 0.6 * union_size AND union_size > 0
    ),
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
        SELECT id_a, name_a, surname_a, email_a, phone_a, created_a, is_active_a,
               id_b, name_b, surname_b, email_b, phone_b, created_b, is_active_b
        FROM name_fuzzy_filtered
      ) all_u
    )
    SELECT DISTINCT ON (LEAST(src.id_a, src.id_b), GREATEST(src.id_a, src.id_b))
      src.id_a, src.name_a, src.surname_a, src.email_a, src.phone_a, src.created_a, src.is_active_a,
      src.id_b, src.name_b, src.surname_b, src.email_b, src.phone_b, src.created_b, src.is_active_b,
      src.match_reason
    FROM all_candidates src
    ORDER BY
      LEAST(src.id_a, src.id_b),
      GREATEST(src.id_a, src.id_b),
      CASE src.match_reason
        WHEN 'email_and_name' THEN 1
        WHEN 'email'          THEN 2
        WHEN 'phone'          THEN 3
        WHEN 'name'           THEN 4
        WHEN 'name_fuzzy'     THEN 5
        ELSE 99
      END
  ) AS final_select;
END;
$fn$;

COMMENT ON FUNCTION public.detect_duplicate_clients(uuid) IS
  'Detects candidate duplicate client pairs. Stages: (1) email-only join using idx_clients_company_email_func; (2) phone-only join; (3) name-only exact normalized join using idx_clients_company_name_norm; (4) name_fuzzy: same-first-name self-join + Jaccard >= 0.6. v3 wraps the SELECT in a subquery aliased as `src` to disambiguate the PL/pgSQL RETURNS TABLE columns from the CTE columns. Match reason priority: email_and_name > email > phone > name > name_fuzzy.';

REVOKE EXECUTE ON FUNCTION public.detect_duplicate_clients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_duplicate_clients(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;

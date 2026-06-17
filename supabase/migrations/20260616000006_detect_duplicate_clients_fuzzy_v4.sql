-- ============================================================================
-- Migration: detect_duplicate_clients_fuzzy_v4 (final ambiguity fix)
--
-- v3 wrapped the SELECT in a subquery aliased as `final_select`, but
-- the issue persisted because in PL/pgSQL, RETURNS TABLE column names
-- become in-scope VARIABLES that compete with any CTE column of the
-- same name. The outer `SELECT * FROM final_select` expands to
-- (id_a, name_a, surname_a, ..., id_b, name_b, ..., match_reason)
-- which collides with the RETURNS TABLE column names at the same
-- scope. The frontend RPC call reports
-- "column reference 'id_a' is ambiguous" because the schema cache
-- or introspection layer can't disambiguate.
--
-- v4 fixes this by:
--   1. Renaming the OUTPUT columns to `id_a_out`, `name_a_out`, etc.
--   2. Using a wrapper function that maps the OUT columns to the
--      original public names via a SELECT list.
--
-- Two functions:
--   * public.detect_duplicate_clients(p_company_id uuid) — public API,
--     returns the original column names. This is what the frontend
--     calls.
--   * public._detect_duplicate_clients_inner(p_company_id uuid) —
--     internal implementation with the renamed columns. No naming
--     collision with the PL/pgSQL RETURNS TABLE scope.
-- ============================================================================

BEGIN;

-- Step 1: drop the old function and the v3 wrapper attempt
DROP FUNCTION IF EXISTS public.detect_duplicate_clients(uuid);

-- Step 2: create the inner implementation with UNIQUE output column names
-- (no overlap with common CTE column names). This is the "real" function.
CREATE OR REPLACE FUNCTION public._detect_duplicate_clients_inner(p_company_id uuid)
RETURNS TABLE(
  dup_id_a      uuid,
  dup_name_a    text,
  dup_surname_a text,
  dup_email_a   text,
  dup_phone_a   text,
  dup_created_a timestamptz,
  dup_active_a  boolean,
  dup_id_b      uuid,
  dup_name_b    text,
  dup_surname_b text,
  dup_email_b   text,
  dup_phone_b   text,
  dup_created_b timestamptz,
  dup_active_b  boolean,
  dup_reason    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $inner$
DECLARE
  v_current_user uuid;
  v_company_member_id uuid;
BEGIN
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
    AND ar.name IN ('supervisor', 'owner', 'admin')
  LIMIT 1;

  IF v_company_member_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: must be supervisor, owner, or admin of this company';
  END IF;

  RETURN QUERY
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
    -- Only exclude the placeholder email pair when BOTH sides have it.
    -- (NULL emails are NOT the placeholder, so they're allowed through.)
    AND NOT (
      a.email IS NOT NULL AND lower(a.email) = 'corre@tudominio.es'
      AND b.email IS NOT NULL AND lower(b.email) = 'corre@tudominio.es'
    )
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
      AND NOT (
        a.email IS NOT NULL AND lower(a.email) = 'corre@tudominio.es'
        AND b.email IS NOT NULL AND lower(b.email) = 'corre@tudominio.es'
      )
    ),
    name_fuzzy_filtered AS (
    SELECT * FROM name_fuzzy_pairs
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
  SELECT DISTINCT ON (LEAST(id_a, id_b), GREATEST(id_a, id_b))
    id_a,        -- dup_id_a
    name_a,      -- dup_name_a
    surname_a,   -- dup_surname_a
    email_a,     -- dup_email_a
    phone_a,     -- dup_phone_a
    created_a,   -- dup_created_a
    is_active_a, -- dup_active_a
    id_b,        -- dup_id_b
    name_b,      -- dup_name_b
    surname_b,   -- dup_surname_b
    email_b,     -- dup_email_b
    phone_b,     -- dup_phone_b
    created_b,   -- dup_created_b
    is_active_b, -- dup_active_b
    match_reason -- dup_reason
  FROM all_candidates
  ORDER BY
    LEAST(id_a, id_b),
    GREATEST(id_a, id_b),
    CASE match_reason
      WHEN 'email_and_name' THEN 1
      WHEN 'email'          THEN 2
      WHEN 'phone'          THEN 3
      WHEN 'name'           THEN 4
      WHEN 'name_fuzzy'     THEN 5
      ELSE 99
    END;
END;
$inner$;

-- Step 3: create the public wrapper that exposes the original column
-- names. The wrapper does a single SELECT pass-through, which keeps
-- the output names stable for the frontend while the heavy logic
-- stays in the inner function (no name collision).
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
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $wrapper$
  SELECT
    dup_id_a, dup_name_a, dup_surname_a, dup_email_a, dup_phone_a,
    dup_created_a, dup_active_a,
    dup_id_b, dup_name_b, dup_surname_b, dup_email_b, dup_phone_b,
    dup_created_b, dup_active_b,
    dup_reason
  FROM public._detect_duplicate_clients_inner(p_company_id);
$wrapper$;

COMMENT ON FUNCTION public._detect_duplicate_clients_inner(uuid) IS
  'Internal: detects candidate duplicate client pairs with renamed output columns (dup_*) to avoid PL/pgSQL RETURNS TABLE scope collision with CTE columns. Used by public.detect_duplicate_clients.';

COMMENT ON FUNCTION public.detect_duplicate_clients(uuid) IS
  'Public: detects candidate duplicate client pairs within a company. Wraps _detect_duplicate_clients_inner and maps the renamed output columns back to the public names. Stages: (1) email-only join using idx_clients_company_email_func; (2) phone-only join; (3) name-only exact normalized join using idx_clients_company_name_norm; (4) name_fuzzy: same-first-name self-join + Jaccard >= 0.6. Match reason priority: email_and_name > email > phone > name > name_fuzzy. Caller must be supervisor, owner, or admin.';

REVOKE EXECUTE ON FUNCTION public.detect_duplicate_clients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_duplicate_clients(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public._detect_duplicate_clients_inner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._detect_duplicate_clients_inner(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

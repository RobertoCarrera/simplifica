-- Fix: column reference "id_a"/"id_b" is ambiguous inside DISTINCT ON / ORDER BY.
-- In a PL/pgSQL function declared as RETURNS TABLE(id_a uuid, id_b uuid, ...),
-- the return-column names become PL/pgSQL output variables.  Plain references to
-- id_a / id_b inside the function body are therefore ambiguous between those
-- variables and the CTE columns.  Fix: qualify with the CTE alias "candidates.".

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
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    SELECT EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      JOIN public.users u ON u.id = cm.user_id
      WHERE cm.company_id = p_company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin')
        AND u.auth_user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: must be owner or admin of this company';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      a.id         AS id_a,
      a.name       AS name_a,
      a.surname    AS surname_a,
      a.email      AS email_a,
      a.phone      AS phone_a,
      a.created_at AS created_a,
      a.is_active  AS is_active_a,
      b.id         AS id_b,
      b.name       AS name_b,
      b.surname    AS surname_b,
      b.email      AS email_b,
      b.phone      AS phone_b,
      b.created_at AS created_b,
      b.is_active  AS is_active_b,
      CASE
        WHEN a.email IS NOT NULL
          AND lower(trim(a.email)) = lower(trim(b.email))
          AND lower(trim(a.email)) <> ''
          AND lower(trim(a.name)) = lower(trim(b.name))
          AND lower(trim(a.surname)) = lower(trim(b.surname))
          THEN 'email_and_name'
        WHEN a.email IS NOT NULL
          AND lower(trim(a.email)) = lower(trim(b.email))
          AND lower(trim(a.email)) <> ''
          THEN 'email'
        ELSE 'name'
      END AS match_reason
    FROM public.clients a
    JOIN public.clients b ON b.company_id = a.company_id AND b.id > a.id
    WHERE a.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND (
        (
          a.email IS NOT NULL AND b.email IS NOT NULL
          AND lower(trim(a.email)) = lower(trim(b.email))
          AND lower(trim(a.email)) <> ''
        )
        OR
        (
          a.name IS NOT NULL AND b.name IS NOT NULL
          AND a.surname IS NOT NULL AND b.surname IS NOT NULL
          AND lower(trim(a.name)) = lower(trim(b.name))
          AND lower(trim(a.surname)) = lower(trim(b.surname))
          AND lower(trim(a.name)) <> ''
          AND lower(trim(a.surname)) <> ''
        )
      )
  )
  SELECT DISTINCT ON (LEAST(candidates.id_a, candidates.id_b), GREATEST(candidates.id_a, candidates.id_b))
    candidates.id_a, candidates.name_a, candidates.surname_a, candidates.email_a,
    candidates.phone_a, candidates.created_a, candidates.is_active_a,
    candidates.id_b, candidates.name_b, candidates.surname_b, candidates.email_b,
    candidates.phone_b, candidates.created_b, candidates.is_active_b,
    candidates.match_reason
  FROM candidates
  ORDER BY LEAST(candidates.id_a, candidates.id_b), GREATEST(candidates.id_a, candidates.id_b), candidates.match_reason DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_duplicate_clients(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

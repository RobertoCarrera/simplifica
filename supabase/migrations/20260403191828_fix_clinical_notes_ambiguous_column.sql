-- =============================================================================
-- Fix 42702: ambiguous column "id" in get_client_clinical_notes
-- =============================================================================
-- Problem: The live function uses an unqualified `id` in the permission check
-- subquery:
--   AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
-- PostgreSQL 42702: "id" is ambiguous because RETURNS TABLE(id uuid, ...) creates
-- an output variable named "id" in the function scope.
-- Fix: add table alias `u` and qualify as `u.id`.
-- Additionally, align the decryption approach with the vault-based encryption
-- that is actually used when writing notes (key_version stored per note,
-- secret stored in vault as 'clinical_encryption_key_v{N}').
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_client_clinical_notes(p_client_id uuid)
RETURNS TABLE (
  id              uuid,
  client_id       uuid,
  content         text,
  created_at      timestamptz,
  created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_has_access boolean;
BEGIN
  -- 1. Permission check (all column refs fully qualified to avoid 42702)
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    JOIN public.company_members cm ON c.company_id = cm.company_id
    WHERE c.id = p_client_id
      AND cm.user_id = (SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid())
      AND cm.status = 'active'
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Access denied: user is not an active member of this client''s company';
  END IF;

  -- 2. Return decrypted notes using per-note vault key (key_version column)
  RETURN QUERY
  SELECT
    n.id,
    n.client_id,
    extensions.pgp_sym_decrypt(
      n.content::bytea,
      (
        SELECT ds.decrypted_secret
        FROM vault.decrypted_secrets ds
        WHERE ds.name = 'clinical_encryption_key_v' || n.key_version::TEXT
      )
    ) AS content,
    n.created_at,
    u.name AS created_by_name
  FROM public.client_clinical_notes n
  LEFT JOIN public.users u ON n.created_by = u.id
  WHERE n.client_id = p_client_id
  ORDER BY n.created_at DESC;
END;
$$;

-- Grant execution to authenticated users (SECURITY DEFINER runs as owner)
GRANT EXECUTE ON FUNCTION public.get_client_clinical_notes(uuid) TO authenticated;

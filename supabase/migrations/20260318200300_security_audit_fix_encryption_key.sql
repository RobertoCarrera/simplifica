-- ============================================================
-- SECURITY AUDIT: Remove hardcoded encryption key from clinical notes RPCs
-- Date: 2026-03-18
-- Risk: MEDIUM — Hardcoded key 'simplifica-secure-key-2026' is visible
--        in source code and git history. Move to Supabase vault/secrets.
-- ============================================================

-- Recreate create_clinical_note using Supabase secrets (via current_setting)
-- The key must be stored as a Supabase secret: CLINICAL_NOTES_ENCRYPTION_KEY
CREATE OR REPLACE FUNCTION public.create_clinical_note(p_client_id uuid, p_content text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note_id uuid;
  v_encrypted_content text;
  v_encryption_key text;
  v_company_id uuid;
BEGIN
  -- 1. Permission Check: Is the user an active member?
  SELECT c.company_id INTO v_company_id
  FROM public.clients c
  JOIN public.company_members cm ON c.company_id = cm.company_id
  WHERE c.id = p_client_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active';
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: User is not an active member of the client company';
  END IF;

  -- Load encryption key from Supabase secrets (set via Dashboard > Settings > Vault)
  v_encryption_key := current_setting('app.settings.clinical_notes_encryption_key', true);
  IF v_encryption_key IS NULL OR v_encryption_key = '' THEN
    RAISE EXCEPTION 'CLINICAL_NOTES_ENCRYPTION_KEY not configured. Set it in Supabase Dashboard > Settings > Vault.';
  END IF;

  -- Encrypt
  v_encrypted_content := pgp_sym_encrypt(p_content, v_encryption_key);
  -- Insert
  INSERT INTO public.client_clinical_notes (client_id, content, created_by)
  VALUES (p_client_id, v_encrypted_content, (SELECT id FROM public.users WHERE auth_user_id = auth.uid()))
  RETURNING id INTO v_note_id;
  RETURN jsonb_build_object(
    'id', v_note_id,
    'success', true
  );
END;
$$;

-- Recreate get_client_clinical_notes using the same secret
CREATE OR REPLACE FUNCTION public.get_client_clinical_notes(p_client_id uuid)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  content text,
  created_at timestamptz,
  created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encryption_key text;
  v_has_access boolean;
BEGIN
  -- 1. Permission Check
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.company_members cm ON c.company_id = cm.company_id
    WHERE c.id = p_client_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
  ) INTO v_has_access;
  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Access denied: User is not an active member of the client company';
  END IF;

  -- Load encryption key from secrets
  v_encryption_key := current_setting('app.settings.clinical_notes_encryption_key', true);
  IF v_encryption_key IS NULL OR v_encryption_key = '' THEN
    RAISE EXCEPTION 'CLINICAL_NOTES_ENCRYPTION_KEY not configured. Set it in Supabase Dashboard > Settings > Vault.';
  END IF;

  -- 2. Return Decrypted Data
  RETURN QUERY
  SELECT
    n.id,
    n.client_id,
    pgp_sym_decrypt(n.content::bytea, v_encryption_key) AS content,
    n.created_at,
    u.name AS created_by_name
  FROM public.client_clinical_notes n
  LEFT JOIN public.users u ON n.created_by = u.id
  WHERE n.client_id = p_client_id
  ORDER BY n.created_at DESC;
END;
$$;

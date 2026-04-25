-- =============================================================================
-- Fix create_clinical_note: use vault key (consistent with get_client_clinical_notes)
-- =============================================================================
-- Problem: The production function was manually edited to use
--   current_setting('app.settings.clinical_notes_encryption_key', true)
-- which is not configured. Additionally, it called pgp_sym_encrypt without the
-- 'extensions.' prefix, which fails under search_path = 'public'.
--
-- Root cause: a manual SQL edit overrode the vault-based version created by
-- migration 20260319000001_vault_clinical_encryption.sql.
--
-- Fix: restore the intended vault-based implementation, consistent with
-- get_client_clinical_notes() which already reads from vault.decrypted_secrets.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_clinical_note(p_client_id uuid, p_content text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_note_id          uuid;
  v_encrypted_content text;
  v_encryption_key   text;
  v_company_id       uuid;
  v_current_version  SMALLINT := 1;
BEGIN
  -- 1. Permission check: caller must be an active member of the client's company
  SELECT c.company_id INTO v_company_id
  FROM public.clients c
  JOIN public.company_members cm ON c.company_id = cm.company_id
  WHERE c.id = p_client_id
    AND cm.user_id = (SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid())
    AND cm.status = 'active';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: user is not an active member of this client''s company';
  END IF;

  -- 2. Read current key from Vault (same approach as get_client_clinical_notes)
  SELECT ds.decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'clinical_encryption_key_v' || v_current_version::TEXT;

  IF v_encryption_key IS NULL OR v_encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key v% not found in Vault. Contact your system administrator.', v_current_version;
  END IF;

  -- 3. Encrypt and insert
  v_encrypted_content := extensions.pgp_sym_encrypt(p_content, v_encryption_key);

  INSERT INTO public.client_clinical_notes (client_id, content, created_by, key_version)
  VALUES (
    p_client_id,
    v_encrypted_content,
    (SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid()),
    v_current_version
  )
  RETURNING id INTO v_note_id;

  RETURN jsonb_build_object('id', v_note_id, 'success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_clinical_note(uuid, text) TO authenticated;

-- =====================================================================
-- feat/clinical-history-importer
-- Extends public.create_clinical_note to support the CSV importer.
--
-- Changes from the original:
--   * New optional args: p_title, p_sequence_number, p_event_date,
--     p_source, p_source_id
--   * Idempotency via UPSERT: when (client_id, source, source_id) is
--     provided AND a row with that key exists, the row is updated
--     (re-encrypted if content changed) and {id, deduped: true} is
--     returned. Otherwise a new row is inserted.
--   * Module flag check: company must have company_modules row with
--     module_key = 'historial_clinico' AND status = 'active'
--   * Health-data consent check: clients.health_data_consent must be true
--   * Same encryption: pgp_sym_encrypt with key from vault
--     (clinical_encryption_key_v1) — never changes
--
-- Backwards compatible: all new args are optional and default to NULL,
-- so existing callers (the secure-clinical-notes component) keep working.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_clinical_note(
  p_client_id       uuid,
  p_content         text,
  p_title           text        DEFAULT NULL,
  p_sequence_number int         DEFAULT NULL,
  p_event_date      timestamptz DEFAULT NULL,
  p_source          text        DEFAULT NULL,
  p_source_id       text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_note_id          uuid;
  v_existing_id      uuid;
  v_existing_content text;
  v_encrypted_content text;
  v_encryption_key   text;
  v_company_id       uuid;
  v_caller_user_id   uuid;
  v_current_version  SMALLINT := 1;
  v_deduped          boolean := false;
BEGIN
  -- 1. Resolve caller
  SELECT u.id INTO v_caller_user_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid();

  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: no user profile linked to this auth session';
  END IF;

  -- 2. Permission check: caller must be an active member of the client's company
  SELECT c.company_id INTO v_company_id
  FROM public.clients c
  JOIN public.company_members cm ON c.company_id = cm.company_id
  WHERE c.id = p_client_id
    AND cm.user_id = v_caller_user_id
    AND cm.status = 'active';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: user is not an active member of this client''s company';
  END IF;

  -- 3. Module flag check: historial_clinico must be active for the company
  IF NOT EXISTS (
    SELECT 1 FROM public.company_modules
    WHERE company_id = v_company_id
      AND module_key = 'historial_clinico'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Module not enabled: historial_clinico is not active for this company';
  END IF;

  -- 4. Health-data consent check
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND health_data_consent = true
  ) THEN
    RAISE EXCEPTION 'Consent not granted: client has not consented to health-data processing';
  END IF;

  -- 5. Read encryption key from Vault
  SELECT ds.decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'clinical_encryption_key_v' || v_current_version::TEXT;

  IF v_encryption_key IS NULL OR v_encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key v% not found in Vault. Contact your system administrator.', v_current_version;
  END IF;

  -- 6. Idempotency: if (client_id, source, source_id) already exists, update it
  IF p_source IS NOT NULL AND p_source_id IS NOT NULL THEN
    SELECT id, extensions.pgp_sym_decrypt(content::bytea, v_encryption_key)
      INTO v_existing_id, v_existing_content
    FROM public.client_clinical_notes
    WHERE client_id = p_client_id
      AND source = p_source
      AND source_id = p_source_id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      v_deduped := true;

      -- Re-encrypt only if content actually changed
      IF v_existing_content IS DISTINCT FROM p_content THEN
        v_encrypted_content := extensions.pgp_sym_encrypt(p_content, v_encryption_key);
        UPDATE public.client_clinical_notes
        SET content        = v_encrypted_content,
            title          = COALESCE(p_title, title),
            sequence_number = COALESCE(p_sequence_number, sequence_number),
            event_date     = COALESCE(p_event_date, event_date),
            updated_at     = now()
        WHERE id = v_existing_id
        RETURNING id INTO v_note_id;
      ELSE
        -- Content unchanged: just refresh metadata (title/seq/date) without re-encrypting
        UPDATE public.client_clinical_notes
        SET title          = COALESCE(p_title, title),
            sequence_number = COALESCE(p_sequence_number, sequence_number),
            event_date     = COALESCE(p_event_date, event_date),
            updated_at     = now()
        WHERE id = v_existing_id
        RETURNING id INTO v_note_id;
      END IF;

      RETURN jsonb_build_object('id', v_note_id, 'deduped', v_deduped);
    END IF;
  END IF;

  -- 7. New row: encrypt and insert
  v_encrypted_content := extensions.pgp_sym_encrypt(p_content, v_encryption_key);

  INSERT INTO public.client_clinical_notes (
    client_id, content, created_by, key_version,
    title, sequence_number, event_date, source, source_id, imported_at, imported_by
  )
  VALUES (
    p_client_id,
    v_encrypted_content,
    v_caller_user_id,
    v_current_version,
    p_title,
    p_sequence_number,
    p_event_date,
    p_source,
    p_source_id,
    CASE WHEN p_source IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN p_source IS NOT NULL THEN v_caller_user_id ELSE NULL END
  )
  RETURNING id INTO v_note_id;

  RETURN jsonb_build_object('id', v_note_id, 'deduped', false);
END;
$function$;

-- Permissions unchanged: authenticated role
GRANT EXECUTE ON FUNCTION public.create_clinical_note(
  uuid, text, text, int, timestamptz, text, text
) TO authenticated;

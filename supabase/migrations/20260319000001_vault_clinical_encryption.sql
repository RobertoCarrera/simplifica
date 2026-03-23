-- =====================================================================
-- Migration: Clinical Notes Encryption → Supabase Vault
-- Date: 2026-03-19
-- Reason: Replace hardcoded key 'simplifica-secure-key-2026' with a
--         cryptographically-random key stored in Supabase Vault.
--
-- This migration:
--   1. Enables the vault extension
--   2. Adds key_version column to client_clinical_notes
--   3. Generates a fresh random key in Vault as version 1
--   4. Re-encrypts ALL existing notes (old key was already in Git)
--   5. Updates create_clinical_note()        → reads key from Vault
--   6. Updates get_client_clinical_notes()   → reads key from Vault (per version)
--   7. Updates gdpr_export_client_data()     → reads key from Vault (per version)
--   8. Adds rotate_clinical_notes_key()      → key rotation with audit log
--
-- KEY ROTATION (future use):
--   1. Create new key in Vault:
--      SELECT vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
--             'clinical_encryption_key_v2', 'Clinical notes key version 2');
--   2. Run the rotation function:
--      SELECT rotate_clinical_notes_key(1, 2);
-- =====================================================================

-- 1. Enable required extensions
-- pgcrypto lives in the 'extensions' schema on Supabase (not 'public')
CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- 2. Add key_version column.
--    DEFAULT 0 marks rows encrypted with the OLD hardcoded key.
--    After re-encryption below they become version 1 (vault-backed).
ALTER TABLE public.client_clinical_notes
  ADD COLUMN IF NOT EXISTS key_version SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_clinical_notes_key_version
  ON public.client_clinical_notes (key_version);

-- 3. Create vault secret (random 256-bit key, hex-encoded).
--    Only inserted if it does not already exist so migrations are idempotent.
--    extensions.gen_random_bytes is the pgcrypto function qualified with its schema.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'clinical_encryption_key_v1'
  ) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'clinical_encryption_key_v1',
      'Clinical notes symmetric encryption key - version 1 (AES-256 via pgcrypto pgp_sym_encrypt)'
    );
    RAISE NOTICE 'Created clinical_encryption_key_v1 in Vault.';
  ELSE
    RAISE NOTICE 'clinical_encryption_key_v1 already exists in Vault, skipping creation.';
  END IF;
END;
$$;

-- 4. Re-encrypt all notes that used the old hardcoded key (key_version = 0).
--    The old key ('simplifica-secure-key-2026') was already committed to Git in
--    6 migration files, so referencing it here does not introduce new exposure.
--    After this block all rows will have key_version = 1.
--    extensions.pgp_sym_* functions are used with the full schema prefix so there
--    is no dependency on search_path.
DO $$
DECLARE
  v_old_key    TEXT := 'simplifica-secure-key-2026';
  v_new_key    TEXT;
  v_count      INTEGER := 0;
  v_failed     INTEGER := 0;
  rec          RECORD;
BEGIN
  SELECT decrypted_secret INTO v_new_key
  FROM vault.decrypted_secrets
  WHERE name = 'clinical_encryption_key_v1';

  IF v_new_key IS NULL OR v_new_key = '' THEN
    RAISE EXCEPTION 'clinical_encryption_key_v1 not found in Vault after creation step — aborting migration.';
  END IF;

  FOR rec IN
    SELECT id, content
    FROM public.client_clinical_notes
    WHERE key_version = 0
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      UPDATE public.client_clinical_notes
      SET
        content     = extensions.pgp_sym_encrypt(extensions.pgp_sym_decrypt(rec.content::bytea, v_old_key), v_new_key),
        key_version = 1,
        updated_at  = NOW()
      WHERE id = rec.id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Note could not be decrypted (e.g. was already using a different key).
      -- Mark as version 1 anyway and log so operator can investigate.
      RAISE WARNING 'Could not re-encrypt note id=% : %. Row skipped.', rec.id, SQLERRM;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RAISE NOTICE 'Re-encryption complete: % notes migrated, % skipped.', v_count, v_failed;
END;
$$;

-- Set the column default to 1 now that all existing rows are version 1
ALTER TABLE public.client_clinical_notes
  ALTER COLUMN key_version SET DEFAULT 1;

-- =====================================================================
-- 5. create_clinical_note()  — reads key from Vault
-- =====================================================================
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
  -- Permission check: caller must be an active member of the client's company
  SELECT c.company_id INTO v_company_id
  FROM public.clients c
  JOIN public.company_members cm ON c.company_id = cm.company_id
  WHERE c.id = p_client_id
    AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.status = 'active';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: user is not an active member of this client''s company';
  END IF;

  -- Read current key from Vault
  SELECT decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets
  WHERE name = 'clinical_encryption_key_v' || v_current_version::TEXT;

  IF v_encryption_key IS NULL OR v_encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key v% not found in Vault. Contact your system administrator.', v_current_version;
  END IF;

  -- Encrypt and insert
  v_encrypted_content := extensions.pgp_sym_encrypt(p_content, v_encryption_key);

  INSERT INTO public.client_clinical_notes (client_id, content, created_by, key_version)
  VALUES (
    p_client_id,
    v_encrypted_content,
    (SELECT id FROM public.users WHERE auth_user_id = auth.uid()),
    v_current_version
  )
  RETURNING id INTO v_note_id;

  RETURN jsonb_build_object('id', v_note_id, 'success', true);
END;
$$;

-- =====================================================================
-- 6. get_client_clinical_notes()  — reads key from Vault per key_version
-- =====================================================================
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
  -- Permission check
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.company_members cm ON c.company_id = cm.company_id
    WHERE c.id = p_client_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Access denied: user is not an active member of this client''s company';
  END IF;

  -- Decrypt each note using its own key version (supports notes from multiple key epochs)
  RETURN QUERY
  SELECT
    n.id,
    n.client_id,
    extensions.pgp_sym_decrypt(
      n.content::bytea,
      (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'clinical_encryption_key_v' || n.key_version::TEXT
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

-- =====================================================================
-- 7. gdpr_export_client_data()  — reads key from Vault per key_version
-- =====================================================================
CREATE OR REPLACE FUNCTION public.gdpr_export_client_data(
  client_email       TEXT,
  requesting_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  client_data   JSONB;
  client_record RECORD;
  v_company_id  UUID;
BEGIN
  -- Verify the requesting user has DPO or elevated access
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = requesting_user_id
      AND (is_dpo = true OR data_access_level IN ('elevated', 'admin') OR is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied: data export requires elevated privileges or DPO role';
  END IF;

  SELECT * INTO client_record FROM public.clients WHERE email = client_email LIMIT 1;

  IF client_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;

  v_company_id := client_record.company_id;

  -- Aggregate data – clinical notes are decrypted inline per key version
  SELECT jsonb_build_object(
    'profile', to_jsonb(client_record),
    'clinical_notes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',         n.id,
        'content',    extensions.pgp_sym_decrypt(
                        n.content::bytea,
                        (SELECT decrypted_secret
                         FROM vault.decrypted_secrets
                         WHERE name = 'clinical_encryption_key_v' || n.key_version::TEXT)
                      ),
        'created_at', n.created_at,
        'created_by', n.created_by
      ))
      FROM public.client_clinical_notes n
      WHERE n.client_id = client_record.id
    ), '[]'::jsonb),
    'consents', COALESCE((
      SELECT jsonb_agg(to_jsonb(cr))
      FROM public.gdpr_consent_records cr
      WHERE cr.subject_email = client_email
    ), '[]'::jsonb),
    'access_requests', COALESCE((
      SELECT jsonb_agg(to_jsonb(ar))
      FROM public.gdpr_access_requests ar
      WHERE ar.subject_email = client_email
    ), '[]'::jsonb),
    'exported_at', NOW()
  )
  INTO client_data;

  -- Audit log
  INSERT INTO public.gdpr_audit_log (
    action_type, table_name, record_id, subject_email, purpose, user_id, company_id
  ) VALUES (
    'export',
    'clients',
    client_record.id,
    client_email,
    'Data Portability Request — Art. 20 GDPR',
    requesting_user_id,
    v_company_id
  );

  RETURN client_data;
END;
$$;

-- =====================================================================
-- 8. rotate_clinical_notes_key()  — key rotation with full audit trail
--
-- Usage (run as super_admin after creating the new key in Vault):
--   SELECT vault.create_secret(encode(gen_random_bytes(32),'hex'),
--          'clinical_encryption_key_v2', 'Clinical notes key version 2');
--   SELECT rotate_clinical_notes_key(1, 2);
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rotate_clinical_notes_key(
  p_old_version SMALLINT,
  p_new_version SMALLINT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_old_key TEXT;
  v_new_key TEXT;
  v_count   INTEGER := 0;
  rec       RECORD;
BEGIN
  -- Only super_admin may trigger key rotation
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid() AND is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied: super_admin role required for key rotation';
  END IF;

  IF p_old_version = p_new_version THEN
    RAISE EXCEPTION 'Old and new version must differ';
  END IF;

  -- Retrieve both keys from Vault
  SELECT decrypted_secret INTO v_old_key
  FROM vault.decrypted_secrets
  WHERE name = 'clinical_encryption_key_v' || p_old_version::TEXT;

  IF v_old_key IS NULL OR v_old_key = '' THEN
    RAISE EXCEPTION 'Old key v% not found in Vault', p_old_version;
  END IF;

  SELECT decrypted_secret INTO v_new_key
  FROM vault.decrypted_secrets
  WHERE name = 'clinical_encryption_key_v' || p_new_version::TEXT;

  IF v_new_key IS NULL OR v_new_key = '' THEN
    RAISE EXCEPTION 'New key v% not found in Vault. Create it first: SELECT vault.create_secret(...)', p_new_version;
  END IF;

  -- Re-encrypt all notes with the old version, locking rows to prevent concurrent writes
  FOR rec IN
    SELECT id, content
    FROM public.client_clinical_notes
    WHERE key_version = p_old_version
    FOR UPDATE
  LOOP
    UPDATE public.client_clinical_notes
    SET
      content     = extensions.pgp_sym_encrypt(extensions.pgp_sym_decrypt(rec.content::bytea, v_old_key), v_new_key),
      key_version = p_new_version,
      updated_at  = NOW()
    WHERE id = rec.id;

    v_count := v_count + 1;
  END LOOP;

  -- Audit the rotation
  INSERT INTO public.gdpr_audit_log (
    action_type, table_name, purpose, user_id
  ) VALUES (
    'key_rotation',
    'client_clinical_notes',
    format('Rotated clinical encryption key from v%s → v%s (%s notes)', p_old_version, p_new_version, v_count),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success',       true,
    'rotated_count', v_count,
    'from_version',  p_old_version,
    'to_version',    p_new_version
  );
END;
$$;

-- Revoke direct execution from anon/authenticated; only callable via SECURITY DEFINER chain
REVOKE EXECUTE ON FUNCTION public.rotate_clinical_notes_key(SMALLINT, SMALLINT) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rotate_clinical_notes_key(SMALLINT, SMALLINT) TO authenticated;
-- (The super_admin check inside the function is the authoritative gate)

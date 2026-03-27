-- =====================================================================
-- Migration: Field-Level Encryption for clients PII (DNI + birth_date)
-- Date: 2026-03-25
-- Ticket: pentest-audit-clients-table-remediation / Task 1.1
--
-- What this does:
--   1. Creates Vault key 'clients_pii_key_v1' (separate from clinical notes key)
--   2. Adds encrypted shadow columns: dni_encrypted, birth_date_encrypted
--   3. Adds key_version column for future rotation
--   4. Creates SECURITY DEFINER RPC encrypt_client_pii() — called by upsert-client
--   5. Creates SECURITY DEFINER RPC decrypt_client_pii() — DPO/admin only
--   6. Backfill: encrypts all existing plaintext DNI values (idempotent)
--
-- Rollback strategy:
--   - Encrypted columns are NULLABLE and additive — existing reads still work.
--   - Feature gate: ENABLE_CLIENT_PII_ENCRYPTION env var in Edge Functions.
--   - Plaintext 'dni' column is NOT dropped here; it stays as fallback.
--     (Planned for Phase 5, after smoke test verification.)
--
-- Security notes:
--   - Uses the same pgp_sym_encrypt/decrypt pattern proven for clinical notes.
--   - Separate Vault key per data category (clients vs clinical notes) for
--     better isolation: a clinical notes key compromise doesn't expose DNI.
-- =====================================================================

-- 1. Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS pgcrypto       WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- 2. Create Vault key for clients PII (separate from clinical notes key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'clients_pii_key_v1'
  ) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'clients_pii_key_v1',
      'Client PII symmetric encryption key - version 1 (AES-256 via pgcrypto pgp_sym_encrypt). Covers: DNI, birth_date'
    );
    RAISE NOTICE 'Created clients_pii_key_v1 in Vault.';
  ELSE
    RAISE NOTICE 'clients_pii_key_v1 already exists in Vault, skipping creation.';
  END IF;
END;
$$;

-- 3. Add encrypted shadow columns and key_version tracking
--    All nullable so migration is non-breaking for existing rows.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS dni_encrypted        TEXT,
  ADD COLUMN IF NOT EXISTS birth_date_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS pii_key_version      SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.clients.dni_encrypted        IS 'pgp_sym_encrypt(dni, vault_key) — ciphertext; plaintext dni kept for rollback until Phase 5 backfill verified';
COMMENT ON COLUMN public.clients.birth_date_encrypted IS 'pgp_sym_encrypt(birth_date::text, vault_key) — ciphertext';
COMMENT ON COLUMN public.clients.pii_key_version      IS 'Vault key version used to encrypt this row. Enables key rotation without data loss.';

-- Index to quickly find rows needing backfill or key rotation
CREATE INDEX IF NOT EXISTS idx_clients_pii_key_version ON public.clients (pii_key_version)
  WHERE dni_encrypted IS NOT NULL;

-- =====================================================================
-- 4. encrypt_client_pii() — called by upsert-client Edge Function BEFORE insert/update
--
-- Returns JSONB: { dni_encrypted: text, birth_date_encrypted: text | null }
-- Performs company_id ownership check before encrypting.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.encrypt_client_pii(
  p_company_id UUID,
  p_dni        TEXT,
  p_birth_date TEXT DEFAULT NULL   -- ISO date string 'YYYY-MM-DD' or NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_key            TEXT;
  v_dni_enc        TEXT;
  v_birth_date_enc TEXT;
  v_calling_company UUID;
BEGIN
  -- Verify the calling user belongs to the provided company (multi-tenancy guard)
  SELECT u.company_id INTO v_calling_company
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  -- Allow service role (used by upsert-client Edge Function via service key)
  -- auth.uid() is NULL when called with the service role key — skip check in that case.
  IF auth.uid() IS NOT NULL AND (v_calling_company IS NULL OR v_calling_company <> p_company_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not belong to company %', p_company_id;
  END IF;

  -- Fetch current encryption key from Vault
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'clients_pii_key_v1';

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'Encryption key clients_pii_key_v1 not found in Vault. Contact your system administrator.';
  END IF;

  -- Encrypt DNI (required)
  IF p_dni IS NULL OR p_dni = '' THEN
    RAISE EXCEPTION 'p_dni is required for PII encryption';
  END IF;
  v_dni_enc := extensions.pgp_sym_encrypt(p_dni, v_key);

  -- Encrypt birth_date (optional)
  IF p_birth_date IS NOT NULL AND p_birth_date <> '' THEN
    v_birth_date_enc := extensions.pgp_sym_encrypt(p_birth_date, v_key);
  END IF;

  RETURN jsonb_build_object(
    'dni_encrypted',        v_dni_enc,
    'birth_date_encrypted', v_birth_date_enc,
    'key_version',          1
  );
END;
$$;

-- Grant: authenticated users can call this (Edge Function uses service role, so this is defensive)
GRANT EXECUTE ON FUNCTION public.encrypt_client_pii(UUID, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_client_pii(UUID, TEXT, TEXT) FROM anon;

-- =====================================================================
-- 5. decrypt_client_pii() — DPO / admin / elevated access only
--
-- Returns JSONB: { dni: text, birth_date: text | null }
-- Access check: is_dpo=true OR data_access_level IN ('elevated','admin')
-- =====================================================================
CREATE OR REPLACE FUNCTION public.decrypt_client_pii(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_client        RECORD;
  v_caller_id     UUID;
  v_company_match BOOLEAN := FALSE;
  v_has_access    BOOLEAN := FALSE;
  v_key           TEXT;
  v_dni           TEXT;
  v_birth_date    TEXT;
BEGIN
  -- Identify caller
  SELECT id, company_id, is_dpo, data_access_level, is_super_admin
  INTO v_caller_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  -- Fetch client record
  SELECT id, company_id, dni_encrypted, birth_date_encrypted, pii_key_version
  INTO v_client
  FROM public.clients
  WHERE id = p_client_id
  LIMIT 1;

  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id;
  END IF;

  -- Check caller belongs to same company
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = v_client.company_id
  ) INTO v_company_match;

  IF NOT v_company_match THEN
    RAISE EXCEPTION 'Access denied: caller is not a member of this client''s company';
  END IF;

  -- Check elevated access: DPO or admin/elevated
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND (u.is_dpo = true
           OR u.data_access_level IN ('elevated', 'admin')
           OR u.is_super_admin = true)
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Access denied: decryption requires DPO role or elevated/admin data access level';
  END IF;

  -- Fetch Vault key for the row's key version
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'clients_pii_key_v' || v_client.pii_key_version::TEXT;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'Encryption key v% not found in Vault', v_client.pii_key_version;
  END IF;

  -- Decrypt
  IF v_client.dni_encrypted IS NOT NULL THEN
    v_dni := extensions.pgp_sym_decrypt(v_client.dni_encrypted::bytea, v_key);
  END IF;

  IF v_client.birth_date_encrypted IS NOT NULL THEN
    v_birth_date := extensions.pgp_sym_decrypt(v_client.birth_date_encrypted::bytea, v_key);
  END IF;

  -- Audit log: record that this decryption occurred (GDPR Art. 30)
  BEGIN
    INSERT INTO public.gdpr_audit_log (
      action_type, table_name, record_id, purpose, user_id, company_id
    ) VALUES (
      'DECRYPT_CLIENT_PII',
      'clients',
      p_client_id,
      'Authorized PII decryption via decrypt_client_pii()',
      v_caller_id,
      v_client.company_id
    );
  EXCEPTION WHEN OTHERS THEN
    -- Audit failure must not block decryption; log to server log instead
    RAISE WARNING 'Audit log insert failed during decrypt_client_pii for client %: %', p_client_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'dni',        v_dni,
    'birth_date', v_birth_date
  );
END;
$$;

-- Restrict: only authenticated (DPO/admin check is inside the function)
GRANT EXECUTE ON FUNCTION public.decrypt_client_pii(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_client_pii(UUID) FROM anon;

-- =====================================================================
-- 6. backfill_clients_dni_encryption() — idempotent batch backfill
--
-- Encrypts all existing plaintext DNI values into dni_encrypted.
-- Only processes rows where dni_encrypted IS NULL (skips already-encrypted).
-- Runs in a single transaction — for large datasets use the Edge Function
-- version that runs in batches (Phase 1 task 1.4 deliverable).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.backfill_clients_dni_encryption()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_key     TEXT;
  v_count   INTEGER := 0;
  v_skipped INTEGER := 0;
  v_failed  INTEGER := 0;
  rec       RECORD;
BEGIN
  -- Super admin only — this is a one-time admin operation
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid() AND is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied: super_admin role required for backfill operation';
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'clients_pii_key_v1';

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'clients_pii_key_v1 not found in Vault — run the encrypt_clients_pii migration first.';
  END IF;

  FOR rec IN
    SELECT id, dni
    FROM public.clients
    WHERE dni IS NOT NULL
      AND dni <> ''
      AND dni <> 'PENDIENTE'
      AND dni_encrypted IS NULL     -- skip already-encrypted rows (idempotency)
    FOR UPDATE SKIP LOCKED          -- skip rows locked by concurrent writes
  LOOP
    BEGIN
      UPDATE public.clients
      SET
        dni_encrypted   = extensions.pgp_sym_encrypt(rec.dni, v_key),
        pii_key_version = 1,
        updated_at      = NOW()
      WHERE id = rec.id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Backfill failed for client id=% : %. Row skipped.', rec.id, SQLERRM;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  -- Audit the backfill operation
  BEGIN
    INSERT INTO public.gdpr_audit_log (
      action_type, table_name, purpose, user_id
    ) VALUES (
      'BACKFILL_PII_ENCRYPTION',
      'clients',
      format('Backfilled DNI encryption: %s encrypted, %s skipped, %s failed', v_count, v_skipped, v_failed),
      (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Audit log insert failed during backfill: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success',  true,
    'encrypted', v_count,
    'skipped',   v_skipped,
    'failed',    v_failed
  );
END;
$$;

-- Only super_admin can run backfill
GRANT EXECUTE ON FUNCTION public.backfill_clients_dni_encryption() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_clients_dni_encryption() FROM anon;

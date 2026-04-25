-- =============================================================================
-- Reseed clinical_encryption_key_v1 in Vault if not present
-- =============================================================================
-- Problem: create_clinical_note() reads clinical_encryption_key_v1 from
--          vault.decrypted_secrets. If the key is missing (because the original
--          seeding migration 20260319000001 did not run on this environment, or
--          the Vault extension was not available at the time), the function raises:
--            RAISE EXCEPTION 'Encryption key v1 not found in Vault.'
--          rendering clinical note creation unusable.
--
-- Fix: Idempotent re-seed. If the key already exists this is a no-op.
--      If it does not exist, create it using the SAME random-key approach as
--      the original migration.
-- =============================================================================

-- Ensure required extensions are enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

DO $$
DECLARE
  v_existing_secret text;
BEGIN
  -- Check if the key already exists and is non-empty
  SELECT decrypted_secret INTO v_existing_secret
  FROM vault.decrypted_secrets
  WHERE name = 'clinical_encryption_key_v1'
  LIMIT 1;

  IF v_existing_secret IS NOT NULL AND v_existing_secret <> '' THEN
    RAISE NOTICE 'clinical_encryption_key_v1 already exists in Vault — no action needed.';
  ELSE
    -- Key missing or corrupt: create a fresh one
    -- NOTE: If there are already encrypted notes in the DB with a previously
    --       generated key, they will NOT be decryptable with this new key.
    --       This migration is safe only for fresh databases or databases where
    --       clinical notes have never been created.
    --       If you have existing notes, restore the original key via the
    --       Supabase Dashboard → Vault section instead of running this migration.
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'clinical_encryption_key_v1',
      'Clinical notes symmetric encryption key - version 1 (AES-256 via pgcrypto pgp_sym_encrypt)'
    );
    RAISE NOTICE 'clinical_encryption_key_v1 created in Vault.';
  END IF;
END;
$$;

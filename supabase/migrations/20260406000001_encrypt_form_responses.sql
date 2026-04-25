-- =====================================================================
-- Migration: Encrypt booking form_responses using Supabase Vault
-- Date: 2026-04-06
-- GDPR: Fase 1 — Cumplimiento Art. 25 (Privacy by Design)
--
-- form_responses containia datos personales de formularios de reserva
-- (nombre, email, respuestas custom) en texto plano en la columna
-- existing 'form_responses JSONB'. Esta migración:
--   1. Crea clave AES-256 en Vault
--   2. Añade columna form_responses_encrypted TEXT (PGP output)
--   3. Añade columna form_responses_key_version SMALLINT
--   4. Migra datos existentes: cifra form_responses → _encrypted
--   5. Pone form_responses a NULL (datos ya cifrados)
--   6. Crea función encrypt_booking_form_responses()
--   7. Crea función decrypt_booking_form_responses(booking_id)
--   8. Crea trigger para auto-cifrar en INSERT/UPDATE
-- =====================================================================

-- 1. Extensiones requeridas (idempotentes)
CREATE EXTENSION IF NOT EXISTS pgcrypto       WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- 2. Columnas nuevas
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS form_responses_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS form_responses_key_version SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bookings_form_key_version
  ON public.bookings (form_responses_key_version)
  WHERE form_responses_encrypted IS NOT NULL;

-- 3. Clave en Vault (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'booking_form_responses_key_v1'
  ) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'booking_form_responses_key_v1',
      'Booking form responses symmetric encryption key - version 1 (AES-256 via pgcrypto pgp_sym_encrypt)'
    );
    RAISE NOTICE 'Created booking_form_responses_key_v1 in Vault.';
  ELSE
    RAISE NOTICE 'booking_form_responses_key_v1 already exists in Vault, skipping.';
  END IF;
END;
$$;

-- 4. Cifrar datos existentes (form_responses → form_responses_encrypted)
DO $$
DECLARE
  v_key    TEXT;
  v_count  INTEGER := 0;
  v_failed INTEGER := 0;
  rec      RECORD;
BEGIN
  -- Check if form_responses column exists before attempting backfill
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'form_responses'
  ) THEN
    RAISE NOTICE 'encrypt_form_responses backfill: skipped — column form_responses does not exist';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'booking_form_responses_key_v1';

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'booking_form_responses_key_v1 not found in Vault — aborting migration.';
  END IF;

  FOR rec IN
    SELECT id, form_responses
    FROM public.bookings
    WHERE form_responses IS NOT NULL
      AND form_responses_encrypted IS NULL
  LOOP
    BEGIN
      UPDATE public.bookings
      SET
        form_responses_encrypted   = extensions.pgp_sym_encrypt(
                                       rec.form_responses::text,
                                       v_key,
                                       'cipher-algo=aes256'
                                     ),
        form_responses_key_version = 1,
        form_responses             = NULL
      WHERE id = rec.id;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'Failed to encrypt booking % : %', rec.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Encrypted % booking form_responses (% failed).', v_count, v_failed;

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % rows failed to encrypt.', v_failed;
  END IF;
END;
$$;

-- 5. Función de cifrado (uso interno por trigger)
CREATE OR REPLACE FUNCTION public.encrypt_booking_form_response(p_plaintext TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'booking_form_responses_key_v1';

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'booking_form_responses_key_v1 not found in Vault';
  END IF;

  RETURN extensions.pgp_sym_encrypt(p_plaintext, v_key, 'cipher-algo=aes256');
END;
$$;

REVOKE ALL ON FUNCTION public.encrypt_booking_form_response(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_booking_form_response(TEXT) TO service_role;

-- 6. Función de descifrado — sólo service_role y authenticated con RLS CHECK
CREATE OR REPLACE FUNCTION public.decrypt_booking_form_response(p_booking_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_key      TEXT;
  v_cipher   TEXT;
  v_version  SMALLINT;
BEGIN
  SELECT form_responses_encrypted, form_responses_key_version
    INTO v_cipher, v_version
  FROM public.bookings
  WHERE id = p_booking_id;

  IF v_cipher IS NULL THEN
    RETURN NULL;
  END IF;

  -- Sólo soportamos clave v1 por ahora; futuro: soportar rotación
  IF v_version != 1 THEN
    RAISE EXCEPTION 'Unsupported key version % for booking %', v_version, p_booking_id;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'booking_form_responses_key_v1';

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'booking_form_responses_key_v1 not found in Vault';
  END IF;

  RETURN extensions.pgp_sym_decrypt(v_cipher::bytea, v_key);
END;
$$;

-- Sólo staff autenticado puede llamar decrypt (RLS de bookings aplica por encima)
REVOKE ALL ON FUNCTION public.decrypt_booking_form_response(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrypt_booking_form_response(UUID) TO authenticated, service_role;

-- 7. Trigger: auto-cifrar form_responses en INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.trigger_encrypt_booking_form_responses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_key TEXT;
BEGIN
  -- Si no viene form_responses en texto plano, no hacemos nada
  IF NEW.form_responses IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'booking_form_responses_key_v1';

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'booking_form_responses_key_v1 not found in Vault — cannot encrypt form_responses';
  END IF;

  -- Cifrar y borrar plaintext
  NEW.form_responses_encrypted   := extensions.pgp_sym_encrypt(
                                      NEW.form_responses::text,
                                      v_key,
                                      'cipher-algo=aes256'
                                    );
  NEW.form_responses_key_version := 1;
  NEW.form_responses             := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_encrypt_booking_form_responses ON public.bookings;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'form_responses'
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_encrypt_booking_form_responses
      BEFORE INSERT OR UPDATE OF form_responses ON public.bookings
      FOR EACH ROW
      WHEN (NEW.form_responses IS NOT NULL)
      EXECUTE FUNCTION public.trigger_encrypt_booking_form_responses()';
  ELSE
    RAISE NOTICE 'encrypt_form_responses trigger: skipped — column form_responses does not exist';
  END IF;
END;
$$;

-- 8. Comentarios de auditoría
DO $outer$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'form_responses'
  ) THEN
    EXECUTE $q$COMMENT ON COLUMN public.bookings.form_responses IS
      'DEPRECATED: Se cifra automáticamente en INSERT/UPDATE. Siempre NULL post-migración.'$q$;
  END IF;
END;
$outer$;
COMMENT ON COLUMN public.bookings.form_responses_encrypted IS
  'PGP-encrypted JSONB form data (Art. 25 Privacy by Design). Clave en Vault: booking_form_responses_key_v1.';
COMMENT ON COLUMN public.bookings.form_responses_key_version IS
  'Versión de clave Vault usada para cifrar form_responses_encrypted. 1=v1 (AES-256).';

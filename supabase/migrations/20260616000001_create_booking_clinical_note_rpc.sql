-- ============================================================================
-- Migration: create_booking_clinical_note_rpc
--
-- Adds a new RPC public.create_booking_clinical_note(p_booking_id uuid,
-- p_content text) that inserts an ENCRYPTED row into public.booking_clinical_notes
-- linked to a booking. Mirrors the consent + module + permission + encryption
-- gates of public.create_clinical_note (which targets client_clinical_notes).
--
-- Why: The Doctoralia CSV importer needs to persist the `comments` field of
--      each row as a clinical-style note attached to the imported booking.
--      Those notes must be encrypted at rest, consent-gated, and only
--      available to active company members. This RPC is the authoritative
--      writer — the edge function calls it; the Angular service never
--      writes directly to booking_clinical_notes.
--
-- Encryption:
--   * Key: vault.decrypted_secrets.name = 'clinical_encryption_key_v1'
--          (SAME key as create_clinical_note — single rotation policy).
--   * Function: extensions.pgp_sym_encrypt / pgp_sym_decrypt.
--   * key_version = 1 (constant, mirrors create_clinical_note).
--
-- Pre-conditions (already in the DB, not created here):
--   * public.booking_clinical_notes table
--   * public.company_modules table
--   * public.clients.health_data_consent
--   * vault.decrypted_secrets row 'clinical_encryption_key_v1'
--   * extensions schema with pgcrypto installed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_booking_clinical_note(
  p_booking_id uuid,
  p_content    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_note_id          uuid;
  v_company_id       uuid;
  v_client_id        uuid;
  v_caller_user_id   uuid;
  v_current_version  SMALLINT := 1;
  v_encrypted_content text;
  v_encryption_key   text;
BEGIN
  -- 1. Resolve the caller's public.users.id from auth.uid()
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: no authenticated session';
  END IF;

  SELECT u.id INTO v_caller_user_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid();

  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: no user profile linked to this auth session';
  END IF;

  -- 2. Permission + tenant check: caller must be an active member of the
  --    booking's company. Resolve client_id from the booking in the same
  --    statement (avoids an extra round-trip and keeps the check atomic).
  SELECT b.company_id, b.client_id
    INTO v_company_id, v_client_id
  FROM public.bookings b
  JOIN public.company_members cm ON cm.company_id = b.company_id
  WHERE b.id = p_booking_id
    AND cm.user_id = v_caller_user_id
    AND cm.status = 'active'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: user is not an active member of this booking''s company';
  END IF;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Invalid booking: booking has no client_id';
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

  -- 4. Health-data consent check on the client linked to the booking
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = v_client_id AND health_data_consent = true
  ) THEN
    RAISE EXCEPTION 'Consent not granted: client has not consented to health-data processing';
  END IF;

  -- 5. Read encryption key from Vault (same key as create_clinical_note)
  SELECT ds.decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'clinical_encryption_key_v' || v_current_version::TEXT;

  IF v_encryption_key IS NULL OR v_encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key v% not found in Vault. Contact your system administrator.', v_current_version;
  END IF;

  -- 6. Encrypt and insert
  v_encrypted_content := extensions.pgp_sym_encrypt(p_content, v_encryption_key);

  INSERT INTO public.booking_clinical_notes (
    booking_id, client_id, content, created_by, key_version
  )
  VALUES (
    p_booking_id, v_client_id, v_encrypted_content, v_caller_user_id, v_current_version
  )
  RETURNING id INTO v_note_id;

  RETURN jsonb_build_object('id', v_note_id, 'deduped', false);
END;
$function$;

COMMENT ON FUNCTION public.create_booking_clinical_note(uuid, text) IS
  'Inserts an encrypted row into public.booking_clinical_notes for a given booking. Mirrors create_clinical_note gates: caller must be an active member of the booking''s company, the historial_clinico module must be active, and the linked client must have health_data_consent = true. Content is encrypted with vault.decrypted_secrets name = ''clinical_encryption_key_v1'' using extensions.pgp_sym_encrypt. Returns {id, deduped}. Used by the Doctoralia CSV importer edge function to persist the `comments` field of imported bookings.';

GRANT EXECUTE ON FUNCTION public.create_booking_clinical_note(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

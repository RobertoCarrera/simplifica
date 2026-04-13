-- =====================================================================
-- Migration: Fix decrypt_client_pii() — is_super_admin column reference
-- Date: 2026-03-25
-- Ticket: pentest-audit-clients-table-remediation / Task 1.6 bugfix
--
-- Problem: decrypt_client_pii() referenced `is_super_admin` column on
-- the users table, but this column does not exist. The correct check
-- uses app_role_id FK to app_roles where name = 'super_admin'.
--
-- This migration replaces decrypt_client_pii() with the corrected version.
-- Mirrors the same fix pattern used in 20260325000001 for backfill.
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
  -- Identify caller (no is_super_admin column — use app_role_id join instead)
  SELECT id INTO v_caller_id
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

  -- Check elevated access: DPO, admin/elevated data_access_level, or super_admin role
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND (
        u.is_dpo = true
        OR u.data_access_level IN ('elevated', 'admin')
        OR EXISTS (
          SELECT 1 FROM public.app_roles ar
          WHERE ar.id = u.app_role_id AND ar.name = 'super_admin'
        )
      )
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
